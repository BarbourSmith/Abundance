import React from 'react';
import FloatingLabel from './FloatingLabel.jsx';

/**
 * Component to render labels in 3D space using FloatingLabel components
 */
export default React.memo(function LabelRenderer({ labels }) {
  if (!labels || labels.length === 0) {
    return null;
  }

  return (
    <>
      {labels.map((label, index) => (
        <FloatingLabel
          key={`label-${index}`}
          text={label.text}
          position={[label.position.x, label.position.y, label.position.z]}
          size={label.size}
        />
      ))}
    </>
  );
});