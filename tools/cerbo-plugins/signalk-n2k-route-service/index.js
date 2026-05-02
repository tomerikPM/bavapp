// signalk-n2k-route-service
// Emitter PGN 130064 (Database List), 130065 (Route List), 130067 (Route - WP Name & Position)
// for aktiv BavApp-rute. Garmin chartplotter sender 126208 Request Group Function for 130067 når
// den ser 129285 fra oss; uten svar avviser den ruten som ufullstendig — men hvert svar tolkes
// som "ny rute mottatt" og lagres lokalt. Vi løser det ved å aldri svare; kun emit ved hash-endring.
//
// Strategi:
//   - Pollér activeRoute hvert 2 sek
//   - Send 130064 + 130065 + 130067 én gang når aktiv rute endres (innhold-hash)
//   - Aldri svar på 126208-request (kun teller diagnostisk)
//   - Send via app.emit('nmea2000JsonOut', pgn) → canbus.js skriver til vecan0 med vår SA
//
// Begrensning (testet 2026-05-02): Garmin GPSMAP 1223xsv aksepterer rute-PGN-er
// (129285+130067) men ignorerer standalone WP-PGN (130074 alene). Auto Guidance er kun
// tilgjengelig for lokalt opprettede ruter, ikke N2K-mottatte. Se prosjektnoten.

module.exports = function (app) {
  let pollTimer = null;
  let route = null;          // { databaseId, routeId, name, waypoints: [{id,name,lat,lon}], hash }
  let lastEmittedHash = null;
  let lastEmitMs = 0;
  let emitCount = 0;
  let requestCount = 0;
  let throttledCount = 0;
  let startTime = Date.now();
  let lastError = null;
  let n2kInputListener = null;

  const MIN_EMIT_INTERVAL_MS = 60 * 1000;

  const DATABASE_ID = 1;
  const ROUTE_ID = 1;
  const DATABASE_NAME = 'BavApp';

  const refreshRoute = async () => {
    try {
      const course = await app.getCourse();
      const ar = course && course.activeRoute;
      if (!ar || !ar.href) { route = null; return; }

      const r = await app.resourcesApi.getResource('routes', ar.href.split('/').pop());
      if (!r || !r.feature || !Array.isArray(r.feature.geometry?.coordinates)) {
        route = null; return;
      }

      const wps = r.feature.geometry.coordinates.map((c, i) => ({
        id: i + 1,
        name: 'WP' + String(i + 1).padStart(2, '0'),
        latitude: c[1],
        longitude: c[0]
      }));

      const name = ar.name || r.name || 'BavApp Route';
      const hash = JSON.stringify({ name, wps });
      route = {
        databaseId: DATABASE_ID,
        routeId: ROUTE_ID,
        name,
        waypoints: wps,
        hash
      };
    } catch (e) {
      lastError = e.message;
      route = null;
    }
  };

  // 130064 — Route and WP Service - Database List
  const emit130064 = () => {
    if (!route) return;
    const pgn = {
      pgn: 130064,
      dst: 255,
      prio: 7,
      fields: {
        startDatabaseId: DATABASE_ID,
        nitems: 1,
        numberOfDatabasesAvailable: 1,
        list: [{
          databaseId: DATABASE_ID,
          databaseName: DATABASE_NAME,
          databaseTimestamp: 0,
          databaseDatestamp: 0,
          wpPositionResolution: 4,   // <0 .. 0.0001] min — høyeste presisjon
          numberOfRoutesInDatabase: 1,
          numberOfWpsInDatabase: route.waypoints.length,
          numberOfBytesInDatabase: 0
        }]
      }
    };
    app.emit('nmea2000JsonOut', pgn);
  };

  // 130065 — Route and WP Service - Route List
  const emit130065 = () => {
    if (!route) return;
    const pgn = {
      pgn: 130065,
      dst: 255,
      prio: 7,
      fields: {
        startRouteId: ROUTE_ID,
        nitems: 1,
        numberOfRoutesInDatabase: 1,
        databaseId: DATABASE_ID,
        list: [{
          routeId: ROUTE_ID,
          routeName: route.name,
          wpIdentificationMethod: 1,    // 1 = "Waypoints embedded in route" (vi sender dem i 130067)
          routeStatus: 0                 // 0 = "Active"
        }]
      }
    };
    app.emit('nmea2000JsonOut', pgn);
  };

  // 130067 — Route and WP Service - Route - WP Name & Position
  const emit130067 = () => {
    if (!route) return;
    const pgn = {
      pgn: 130067,
      dst: 255,
      prio: 7,
      fields: {
        startRps: 0,
        nitems: route.waypoints.length,
        numberOfWpsInTheRouteWpList: route.waypoints.length,
        databaseId: DATABASE_ID,
        routeId: ROUTE_ID,
        list: route.waypoints.map(w => ({
          wpId: w.id,
          wpName: w.name,
          wpLatitude: w.latitude,
          wpLongitude: w.longitude
        }))
      }
    };
    app.emit('nmea2000JsonOut', pgn);
  };

  const emitAll = (reason) => {
    if (!route) return;
    try {
      emit130064();
      emit130065();
      emit130067();
      emitCount++;
      lastEmitMs = Date.now();
    } catch (e) {
      lastError = 'emit: ' + e.message;
    }
  };

  // Hvis ruta er endret siden forrige emit → send én gang
  const emitIfChanged = () => {
    if (!route) { lastEmittedHash = null; return; }
    if (route.hash !== lastEmittedHash) {
      emitAll('changed');
      lastEmittedHash = route.hash;
    }
  };

  // Lytt på innkommende N2K kun for å telle 126208-requests (diagnostikk).
  // Vi svarer IKKE på dem: Garmin tolker hver mottak av 130067 som "ny rute mottatt"
  // og lagrer den lokalt, uavhengig av routeId. Send derfor kun på endring av ruta.
  const onN2kIn = (msg) => {
    if (!msg || msg.pgn !== 126208) return;
    if (msg.dst !== 100) return;
    const f = msg.fields || {};
    if (f.functionCode !== 'Request' && f.functionCode !== 0) return;
    const requestedPgn = f.pgn;
    if (requestedPgn === 130064 || requestedPgn === 130065 || requestedPgn === 130067) {
      requestCount++;
      throttledCount++;   // alltid throttlet — vi svarer ikke
    }
  };

  const updateStatus = () => {
    const uptime = Math.round((Date.now() - startTime) / 1000);
    const wp = route ? route.waypoints.length : 0;
    const status = `up=${uptime}s route=${route ? 'yes' : 'no'} wp=${wp} emit=${emitCount} req=${requestCount} thr=${throttledCount}` +
                   (lastError ? ` err=${lastError.slice(0, 40)}` : '');
    if (app.setPluginStatus) app.setPluginStatus(status);
  };

  return {
    id: 'signalk-n2k-route-service',
    name: 'N2K Route Service (130064/130065/130067)',
    description: 'Emitter Route Service PGN-er som Garmin chartplotter forventer',
    schema: { type: 'object', properties: {} },

    start: function () {
      startTime = Date.now();
      emitCount = 0;
      requestCount = 0;
      throttledCount = 0;
      lastEmittedHash = null;
      lastEmitMs = 0;
      n2kInputListener = onN2kIn;
      app.on('N2KAnalyzerOut', n2kInputListener);
      pollTimer = setInterval(() => {
        refreshRoute().then(() => { emitIfChanged(); updateStatus(); });
      }, 2000);
      refreshRoute().then(() => { emitIfChanged(); updateStatus(); });
    },

    stop: function () {
      if (n2kInputListener) app.removeListener('N2KAnalyzerOut', n2kInputListener);
      n2kInputListener = null;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      route = null;
      lastEmittedHash = null;
    }
  };
};
