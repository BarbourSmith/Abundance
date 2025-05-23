import React from 'react';
import { Text } from '@react-three/drei';

/**
 * FloatingLabel component that renders text labels in 3D space
 * This component follows the replicad pattern for displaying labels
 */
export default React.memo(function FloatingLabel({ 
  text, 
  position = [0, 0, 0], 
  size = 1, 
  color = "#000000",
  ...props 
}) {
  return (
    <Text
      position={position}
      fontSize={size}
      color={color}
      anchorX="center"
      anchorY="middle"
      outlineWidth={0.05}
      outlineColor="#ffffff"
      {...props}
    >
      {text}
    </Text>
  );
});