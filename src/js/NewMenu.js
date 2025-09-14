import CMenu from "./circular-menu";
import GlobalVariables from "./globalvariables.js";

/**
 * Html element that contains the circular menu
 */
var ele = null; //document.querySelector('#circle-menu1')
var cmenu;

const createCMenu = (targetElement) => {
  ele = targetElement;
  
  /**
   * Check if there are any selected atoms or connectors
   */
  const hasSelectedItems = () => {
    // Check for selected atoms
    const hasSelectedAtoms = GlobalVariables.currentMolecule.nodesOnTheScreen.some(atom => atom.selected);
    
    // Check for selected connectors by looking at all input attachment points
    const hasSelectedConnectors = GlobalVariables.currentMolecule.nodesOnTheScreen.some(atom => 
      atom.inputs.some(input => 
        input.connectors.some(connector => connector.selected)
      )
    );
    
    return hasSelectedAtoms || hasSelectedConnectors;
  };

  /**
   * Handle deletion of selected atoms and connectors (same logic as keyboard delete)
   */
  const deleteSelectedItems = () => {
    // Save undo state before deletion
    GlobalVariables.saveUndoState("DELETE", "Deleted selected atoms");

    // First, collect selected atoms for deletion
    GlobalVariables.atomsSelected = [];
    GlobalVariables.currentMolecule.copy(); // This populates atomsSelected with selected atoms

    // Delete selected atoms
    GlobalVariables.atomsSelected.forEach((item) => {
      GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((nodeOnTheScreen) => {
        if (nodeOnTheScreen.uniqueID == item.uniqueID) {
          nodeOnTheScreen.deleteNode();
        }
      });
    });

    // Delete selected connectors by forwarding keyPress to all atoms
    GlobalVariables.currentMolecule.nodesOnTheScreen.forEach((molecule) => {
      molecule.keyPress("Delete");
    });
  };

  // /**
  //      * Runs to create submenus from Global Variables atomCategories. Populates menu objects
  //      * @param {object} group - Name of the category to find appropriate atoms
  //      */
  const makeArray = (group) => {
    var menuArray = [];
    for (var key in GlobalVariables.availableTypes) {
      var instance = GlobalVariables.availableTypes[key];
      if (instance.atomCategory === group) {
        if (instance.atomType === "Box") {
          continue;
        }
        var subMenu = new Object();
        subMenu.title = `${instance.atomType}`;
        subMenu.icon = `${instance.atomType}`;
        subMenu.name = instance.atomType;

        subMenu.click = function menuClick(e, title) {
          if (title.icon === "GitHubMolecule") {
            const containerX = parseInt(cmenu._container.style.left, 10);
            const containerY = parseInt(cmenu._container.style.top, 10);
            GlobalVariables.lastClick = [containerX, containerY];

            if (e.type === "touchend") {
              //need to prevent mousedown from running to keep gitsearch open
              cmenu.hide();
              e.preventDefault();
              console.log(
                "Touch event detected, preventing further click behavior."
              );
            }
          } else {
            e.target.id = title.name;
            placeNewNode(e);
          }
        };
        menuArray.push(subMenu);
      }
    }
    return menuArray;
  };

  /**
   * Create the menu configuration, optionally including delete option
   */
  const createMenuConfig = () => {
    const baseMenus = [
      {
        title: "Actions",
        icon: "Actions",
        menus: makeArray("Actions"),
      },
      {
        title: "Inputs",
        icon: "Inputs",
        menus: makeArray("Inputs"),
      },
      {
        title: "Tags",
        icon: "Tags",
        menus: makeArray("Tags"),
      },
      {
        title: "Import/Export",
        icon: "Import-Export",
        menus: makeArray("ImportExport"),
      },
      {
        title: "Shapes",
        icon: "Shapes",
        menus: makeArray("Shapes"),
      },
      {
        title: "Interactions",
        icon: "Interaction",
        menus: makeArray("Interactions"),
      },
    ];

    // Add delete option if there are selected items
    if (hasSelectedItems()) {
      baseMenus.unshift({
        title: "Delete",
        icon: "Delete",
        click: function(e) {
          deleteSelectedItems();
          cmenu.hide();
        }
      });
    }

    return baseMenus;
  };

  /**
   * This creates a new instance of the circular menu.
   */
  cmenu = CMenu(ele.current).config({
    hideAfterClick: GlobalVariables.isMobile() ? false : true,
    percent: 0.15,
    menus: createMenuConfig(),
  });

  /**
   * Update the menu configuration dynamically (call before showing)
   */
  const updateMenu = () => {
    cmenu.config({
      hideAfterClick: GlobalVariables.isMobile() ? false : true,
      percent: 0.15,
      menus: createMenuConfig(),
    });
  };

  // Expose the updateMenu function on the cmenu object
  cmenu.updateMenu = updateMenu;

  /* Mask the default context menu on the main canvas*/
  document
    .getElementById("flow-canvas")
    .addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

  /*Mask the default context menu on the menu*/
  ele.current.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // /**
  //      * Runs when a menu option is clicked to place a new atom from the local atoms list.
  //      * @param {object} ev - The event triggered by click event on a menu item.
  //      */
  function placeNewNode(e) {
    let clr = e.target.id;
    const containerX = parseInt(cmenu._container.style.left, 10);
    const containerY = parseInt(cmenu._container.style.top, 10);
    GlobalVariables.currentMolecule.placeAtom(
      {
        x: GlobalVariables.pixelsToWidth(containerX),
        y: GlobalVariables.pixelsToHeight(containerY),
        parent: GlobalVariables.currentMolecule,
        atomType: clr,
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      true
    );
    //Simulate a click on the new atom
    cmenu.hide();
    var clickHandledByAtom = false;

    // Ensure canvas regains focus after placing atom
    const flowCanvas = document.getElementById("flow-canvas");
    if (flowCanvas) {
      flowCanvas.focus();
    }
  }
};

export { createCMenu, cmenu };
