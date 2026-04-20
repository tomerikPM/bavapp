import { Handle, Position } from '@xyflow/react';

const ICONS = {
  source:     '⚡',
  battery:    '🔋',
  controller: '🖥',
  panel:      '⊞',
  consumer:   '○',
  network:    '◈',
  engine:     '⚙',
};

export default function BavNode({ data, type }) {
  const nodeType = data.nodeType || 'consumer';
  return (
    <div className={`rf-node type-${nodeType}`}>
      {/* Handles — show on all sides for flexibility */}
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0 }} />

      <div className="rf-node-icon">{ICONS[nodeType] || '○'}</div>
      <div className="rf-node-label">{data.label}</div>
      {data.sub && <div className="rf-node-sub">{data.sub}</div>}
      {data.badge && (
        <div>
          <span className={`rf-node-badge badge-${data.badge}`}>{data.badge}</span>
        </div>
      )}
    </div>
  );
}
