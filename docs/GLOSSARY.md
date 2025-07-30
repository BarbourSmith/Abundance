# Abundance Glossary

## Core Concepts

### **Atom**
The basic building blocks of designs in Abundance. Atoms are individual operations or shapes that cannot be broken down further. Examples include Circle, Rectangle, Extrude, Rotate, etc. Think of atoms as the built-in functions of a programming language.

### **Molecule**
A reusable combination of atoms that creates a more complex component. Molecules can contain any number of atoms in a useful configuration. They function like user-defined functions in programming - they encapsulate logic and can be reused across projects.

### **Flow**
The visual programming interface where atoms and molecules are connected together. The flow represents the logical sequence of operations that create the final 3D model. It's equivalent to the source code in traditional programming.

### **Connector**
Visual lines that link atoms and molecules together, representing data flow between operations. Connectors determine the order of operations and pass geometry data from one operation to the next.

### **Assembly**
A combination of multiple shapes where shapes maintain their individual identity. When shapes intersect in an assembly, earlier shapes subtract from later ones. Used when you need to create holes or cutouts (e.g., a bolt creating a hole in a part).

### **Fusion**
A combination where multiple shapes are permanently merged into a single, inseparable shape. All shapes become one unified geometry.

## Shape Categories

### **2D Shapes (Sketches)**
- **Circle**: Creates circular sketches on the XY plane
- **Rectangle**: Creates rectangular sketches on the XY plane  
- **Regular Polygon**: Creates polygonal sketches with specified number of sides
- **Text**: Creates text-based sketches on the XY plane

### **3D Operations**
- **Extrude**: Converts 2D shapes into 3D by adding height/depth
- **Loft**: Creates 3D shapes by connecting multiple 2D profiles
- **ShrinkWrap**: Combines multiple sketches into a single shape as if shrink-wrapped

## Boolean Operations

### **Intersection**
Creates a new shape from the overlapping area of two input shapes. Only the common volume/area between shapes is kept.

### **Difference** 
Subtracts one shape from another. The second shape is removed from the first, creating holes or cutouts.

### **Join**
Combines multiple shapes together. Can be set to Assembly mode (shapes remain separate) or Fusion mode (shapes merge permanently).

## Transformation Operations

### **Move/Translate**
Moves shapes in 3D space along X, Y, or Z axes without changing their orientation or size.

### **Rotate**
Rotates shapes around any of the three axes (X, Y, Z) by specified angles.

### **Scale**
Resizes shapes by a multiplication factor. 1.0 keeps original size, 2.0 doubles size, 0.5 halves size.

### **Color**
Applies visual color to shapes for display and organization purposes.

## Data and Logic

### **Input**
Defines variables that can be modified by users. When a project is shared, recipients can adjust input values to customize the design.

### **Constant**
Defines fixed numerical values that can be used to control multiple parameters throughout the design.

### **Equation**
Performs mathematical operations on numbers from constants or other sources.

### **Code**
Allows entry of custom ReplicaD JavaScript code for advanced operations not available through visual atoms.

## Organization and Documentation

### **Tag**
Adds labels to parts that can be used to retrieve specific components from assemblies later.

### **BOM Tag (Bill of Materials)**
Tags parts with bill of materials information. Tagged parts automatically appear in the project's bill of materials based on how many times they appear in the final design.

### **README**
Adds documentation notes to projects. The text appears in the project's README file for other users.

### **Extract Tag**
Retrieves previously tagged parts from assemblies for further operations.

## Import/Export

### **Import**
Loads external geometry files (STL, SVG, STEP) into the design.

### **Export**
Marks parts for download and makes them available in various file formats (STL, STEP, etc.).

### **GCode**
Generates machine instructions for CNC/3D printing from 3D geometry.

### **GitHub Molecule**
Imports other Abundance projects as reusable molecules, enabling collaboration and code reuse.

### **CutLayout**
Organizes 2D shapes for efficient cutting on sheet materials (laser cutting, CNC routing).

## Technical Terms

### **ReplicaD**
The underlying 3D CAD engine that powers Abundance. Based on OpenCASCADE, it handles all geometric computations and boolean operations.

### **Worker Thread**
Background processing threads that handle heavy geometric computations without blocking the user interface.

### **Flow Compilation**
The process of converting the visual flow diagram into executable operations for the 3D engine.

### **Attachment Points**
Connection points on atoms and molecules where connectors can be attached to pass data between operations.

### **Output**
Every molecule has exactly one output that represents the final result of all operations within that molecule. The top-level output is the final project result.

## User Interface Elements

### **Flow Screen**
The upper area of the interface where the visual programming flow is created and edited.

### **3D Viewer**
The lower area showing the real-time 3D rendering of the current design.

### **Circular Menu**
The radial menu system (spawned by right-clicking) used to place new atoms in the flow.

### **Property Panel**
Interface elements that allow editing parameters and dimensions of selected shapes.

### **Create Mode**
The editing interface for project owners to build and modify designs.

### **Run Mode**
The viewing interface for non-owners to view, fork, or download projects.

## Project Management

### **Fork**
Creating a personal copy of someone else's project that you can modify independently.

### **Version Control**
Built-in tracking of project changes through GitHub integration, allowing rollback and collaboration.

### **Collaboration**
Multiple users working on the same project through GitHub's sharing and version control features.