import style from "./../style";
import classed from "./../classed";

// Responsive sizing ratios based on viewport width
const getResponsiveSizing = () => {
  const viewportWidth = window.innerWidth;
  
  if (viewportWidth <= 480) {
    // Extra small mobile devices
    return {
      sizeRatio: 0.5,
      marginTopRatio: 0.15,
      fontHeight: 10
    };
  } else if (viewportWidth <= 768) {
    // Mobile devices
    return {
      sizeRatio: 0.55,
      marginTopRatio: 0.18,
      fontHeight: 11
    };
  } else {
    // Desktop/tablet
    return {
      sizeRatio: 0.65,
      marginTopRatio: 0.2,
      fontHeight: 13
    };
  }
};

export function hasIcon(icon){
    if(icon === undefined) return false;
    else if(typeof icon === "string") return icon !== "";
    else return icon.length && icon[0] !== "";
}

function getIcon(icon){
    return typeof icon === "string"? icon : icon[0];
}

function getIconColor(icon){
    return typeof icon === "string"? null : icon[1];
}

export default function (parent, data, index) {
    if(!hasIcon(data.icon)) return;

    var span = document.createElement('span');

    var icon = getIcon(data.icon),
        color = getIconColor(data.icon);

    classed(span, icon + " cm-icon", true);
    style(span, 'color', color);

    // Use responsive sizing
    const sizing = getResponsiveSizing();
    var l = this._calc.clickZoneRadius * sizing.sizeRatio - sizing.fontHeight + "px",
        m = this._calc.clickZoneRadius * sizing.marginTopRatio - sizing.fontHeight + "px";
    
    style(span, 'width', l);
    style(span, 'height', l);
    style(span, 'font-size', l);
    style(span, 'margin-top', m);

    parent.appendChild(span);
}