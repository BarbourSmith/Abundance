import React from 'react';
import { Text } from '@react-three/drei';

/**
 * Component to render labels in 3D space
 */
export default React.memo(function LabelRenderer({ labels }) {
  if (!labels || labels.length === 0) {
    return null;
  }

  return (
    <>
      {labels.map((label, index) => (
        <Text
          key={`label-${index}`}
          position={[label.position.x, label.position.y, label.position.z]}
          fontSize={label.size}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#ffffff"
        >
          {label.text}
        </Text>
      ))}
    </>
  );
});