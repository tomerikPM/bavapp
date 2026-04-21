import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect } from 'react';
import BavNode from './BavNode.jsx';
import { useDiagramData } from './useDiagramData.js';

const nodeTypes = { bavNode: BavNode };

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#ccc' },
};

export default function NmeaDiagram() {
  const { nodes: apiNodes, edges: apiEdges, loading, error } = useDiagramData('nmea');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => { setNodes(apiNodes); }, [apiNodes, setNodes]);
  useEffect(() => { setEdges(apiEdges); }, [apiEdges, setEdges]);

  if (loading && !nodes.length) return <div style={loadStyle}>Henter NMEA-diagram…</div>;
  if (error   && !nodes.length) return <div style={loadStyle}>⚠ {error}</div>;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="#d0d4db" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={n => {
            const t = n.data?.nodeType;
            if (t === 'network')    return '#0077c2';
            if (t === 'controller') return '#003b7e';
            if (t === 'engine')     return '#b01020';
            return '#aaa';
          }}
          maskColor="rgba(240,242,245,0.7)"
          style={{ border: '1px solid #e8e8e8' }}
        />
      </ReactFlow>

      <div className="legend">
        <div className="legend-title">Forklaring — signaler</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#0077c2' }} />NMEA 2000 backbone / drop</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#b01020' }} />EVC bus (Volvo Penta)</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#1a7040' }} />Signal K / WebSocket</div>
      </div>
    </div>
  );
}

const loadStyle = {
  display:'flex', alignItems:'center', justifyContent:'center',
  height:'100%', color:'#8a8a8a',
  fontFamily:'Barlow Condensed, sans-serif', fontSize:13,
  letterSpacing:'.1em', textTransform:'uppercase',
};
