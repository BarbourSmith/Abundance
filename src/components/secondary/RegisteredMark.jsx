import React from "react";

const BASE_STYLE = {
  fontSize: "10px",
  fontWeight: 400,
  lineHeight: 1,
  verticalAlign: "top",
  color: "#a67fbc",
};

/**
 * The circle-R shown beside the Abundance name where it appears as a logo.
 * ABUNDANCE is a registered U.S. trademark. Running text uses the plain ®
 * character instead.
 */
const RegisteredMark = ({ style }) => (
  <span style={{ ...BASE_STYLE, ...style }}>®</span>
);

export default RegisteredMark;
