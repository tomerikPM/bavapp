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

export default function ElectricalDiagram() {
  const { nodes: apiNodes, edges: apiEdges, loading, error } = useDiagramData('electrical');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Reflektér API-data inn i React Flow-state når det endres
  useEffect(() => { setNodes(apiNodes); }, [apiNodes, setNodes]);
  useEffect(() => { setEdges(apiEdges); }, [apiEdges, setEdges]);

  if (loading && !nodes.length) return <div style={loadStyle}>Henter elektrisk diagram…</div>;
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
        attributionPosition="bottom-right"
      >
        <Background color="#d0d4db" gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={n => {
            const t = n.data?.nodeType;
            if (t === 'battery')    return '#1a7040';
            if (t === 'source')     return '#e65c00';
            if (t === 'controller') return '#003b7e';
            if (t === 'panel')      return '#7b1fa2';
            if (t === 'engine')     return '#b01020';
            return '#aaa';
          }}
          maskColor="rgba(240,242,245,0.7)"
          style={{ border: '1px solid #e8e8e8' }}
        />
      </ReactFlow>

      <div className="legend">
        <div className="legend-title">Forklaring — ledninger</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#e65c00' }} />230V AC / generert strøm</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#1a7040' }} />12V lading</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#003b7e' }} />12V DC fordeling</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#b01020' }} />Start / høy effekt</div>
        <div className="legend-item"><div className="legend-line" style={{ background: '#8a8a8a' }} />Forbrukere</div>
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
