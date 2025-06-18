import style from "./../style";
import classed from "./../classed";
import on from "./../on";
import styleSheet from "./styleSheet";

function hasSubMenus(menus) {
  return menus instanceof Array && menus.length !== 0;
}
function ifDisabled(disabled) {
  if (disabled instanceof Function) return disabled();
  else return Boolean(disabled);
}

function setHref(ele, href) {
  if (!href) return;

  if (href instanceof Object) {
    ele.href = href.url;
    ele.target = href.blank ? "_blank" : "";
  } else {
    ele.href = href;
  }
}

var delayShow = null; // delayShow reference the last setTimeout triggered by any one of menu item(anchor)

export default function (parent, data, index) {
  var self = this;

  var delayHide = null; // delayHide reference the last setTimeout triggered by the menu item itself

  var a = document.createElement("a");

  setHref(a, data.href);

  a.setDisabled = function () {
    classed(a, "disabled", ifDisabled(data.disabled));
  };
  this._anchors.push(a);

  style(a, "width", this._calc.clickZoneSize.width);
  style(a, "height", this._calc.clickZoneSize.height);
  style(a, "right", this._calc.clickZoneSize.marginRight);
  style(a, "bottom", this._calc.clickZoneSize.marginBottom);
  style(
    a,
    "transform",
    "skew(" +
      -this._calc.skewDeg +
      "deg) rotate(" +
      this._calc.unskewDeg +
      "deg) scale(1)"
  );

  classed(a, "disabled", ifDisabled(data.disabled));

  var percent = this._config.percent * 100 + "%";
  styleSheet(
    a,
    "background",
    "radial-gradient(transparent " +
      percent +
      ", " +
      this._config.background +
      " " +
      percent +
      ")"
  );
  styleSheet(
    a,
    "background",
    "radial-gradient(transparent " +
      percent +
      ", " +
      this._config.backgroundHover +
      " " +
      percent +
      ")",
    "hover"
  );

  function clickCallBack(e, data) {
    if (data.click) data.click.call(this, e, data);

    if (self._config.hideAfterClick) {
      self._cMenu.hide();
      if (self._cMenu._pMenu) self._cMenu._pMenu.hide();
      if (subMenu) subMenu.hide();
    }
  }

  // this is where the tooltip div is created to show names of elements in circular menu
  on(a, "mouseenter", function () {
    var div = document.createElement("div");
    div.textContent = data.icon;
    div.classList.add("tooltip");
    div.id = data.icon + "text";
    const length = div.textContent.length * 3; //Correct for text length centering
    document.querySelector("body").appendChild(div);

    style(
      div,
      "top",
      self._container.offsetTop + self._calc.radius - 10 + "px"
    );

    style(
      div,
      "left",
      self._container.offsetLeft + self._calc.radius - length + "px"
    );
  });

  on(a, "click", clickCallBack, data);
  on(a, "touchstart", clickCallBack, data);
  on(a, "touchend", clickCallBack, data);
  on(a, "mouseleave", function () {
    document.getElementById(data.icon + "text").remove();
  });

  parent.appendChild(a);

  this._createHorizontal(a, data, index);

  //toggle subMenu
  if (hasSubMenus(data.menus)) {
    var subMenu = this._createSubMenu(self, data.menus, index);
    let hovered = false;

    // Mouse and Touch Enter
    const showSubMenu = () => {
      hovered = true;
      delayShow = setTimeout(function () {
        if (hovered) {
          subMenu
            .styles({
              top: self._container.offsetTop + self._calc.radius + "px",
              left: self._container.offsetLeft + self._calc.radius + "px",
            })
            .show();
        }
      }, 100);
    };

    on(a, "mouseenter", showSubMenu);
    on(a, "touchstart", showSubMenu);

    // Mouse and Touch Leave
    const hideSubMenu = (e) => {
      if (!subMenu._container.contains(e.toElement)) {
        hovered = false;
        delayHide = setTimeout(function () {
          subMenu.hide();
        }, 100);
      }
    };

    on(a, "mouseleave", hideSubMenu);
    on(a, "touchend", hideSubMenu);

    // Submenu Mouse and Touch Enter
    const subMenuMouseEnter = () => {
      clearTimeout(delayShow);
      clearTimeout(delayHide);
      var div = document.createElement("div");
      div.textContent = data.icon;
      div.classList.add("tooltip");
      div.id = data.icon + "text2";
      const length = div.textContent.length * 3; //Correct for text length centering
      document.querySelector("body").appendChild(div);
      style(div, "top", 50 + "px");
      style(
        div,
        "left",
        self._container.offsetLeft + self._calc.radius - length + 100 + "px"
      );
    };

    on(subMenu._container, "mouseenter", subMenuMouseEnter);
    on(subMenu._container, "touchstart", subMenuMouseEnter);

    // Submenu Mouse and Touch Leave
    const subMenuMouseLeave = (e) => {
      hovered = false;

      const tooltip = document.getElementById(data.icon + "text2");
      if (tooltip) {
        tooltip.remove();
      }

      if (!a.contains(e.toElement) || e.toElement.children[0] === a) {
        subMenu.hide();
      }
    };

    on(subMenu._container, "mouseleave", subMenuMouseLeave);
    on(subMenu._container, "touchend", subMenuMouseLeave);
  }
}
