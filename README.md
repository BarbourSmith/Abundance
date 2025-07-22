

# A web based CAD program for cooperative design.

Abundance breaks with the tradition of CAD programs which inherit from drawing programs and instead inherits from logical languages like programming. This allows it to be a CAD program which can have language like features such as importing modules, version control, and collaboration.

## Login with Github

After the initial screen prompts you to login with Github, all the projects you create on Abundance will be stored as Github Repositories but you can always search for them and find them through the Abundance Platform.

<img width="754" alt="login-screen" src="https://github.com/user-attachments/assets/9393527d-3e11-483f-ac79-96a4b14de2f9">


# Projects Screen

Choose whether you want to create a new project, go into one of your existing projects or take a look at a project that someone else created. If you own the selected project you will be redirected to Create Mode. If the project belongs to someone else you will be redirected to Run Mode where you can choose to fork the project to modify it or simply download it. 

<img width="1395" alt="project-screen" src="https://github.com/user-attachments/assets/ce041419-ea68-43e2-92d5-90f0e41a9841">


# Create Mode


## Flow

A 3D model within Maslow Create is composed of interconnected nodes called Atoms and Molecules which are linked together through connectors. An atom is a shape or an operation you can perform on a shape (ie circle or translate). A molecule can contain any number of atoms in a configuration (ie generate a table leg). Think of Atoms as the built-in functions of a programming language and molecules as the functions you create. Each atom has attachment points to which connectors can attach. 

## Layout of the program

Create Mode has two main areas to interface with. Along the top of the screen is the logical flow of the design. In the lower portion you can see the rendering area where a 3D view of your model will appear. In the lower left is a cluster of menus that lets you do things like change the parameters and dimensions of the selected shape. 

<img width="1436" alt="flow-screen" src="https://github.com/user-attachments/assets/0e746a20-cced-412e-b404-197a2a9640ad">

## Atom Menu

To see and place the available atoms on your flow screen start by right-clicking anywhere within the flow screen area to spawn the circular atom menu. Move your cursor around to spawn the sub-menus and click on the atom you want to place.

<img width="888" alt="top_menu" src="https://github.com/user-attachments/assets/fb28f196-4f31-4f26-abd2-3c1cc59d7280">

The atoms available in the circular menu are divided into 6 categories: 

### Shapes: 
        - Regular Polygon
        - Circle
        - Rectangle
        - Text
        - Molecule
        
### Interactions: 
        - Intersection
        - Difference
        - Join 
        - Loft
        - ShrinkWrap
### Actions: 
        - Color
        - Rotate
        - Extrude
        - Move
        - Genetic Algorithm (disabled)
### Inputs: 
        - Input
        - Constant
        - Equation
        - Code
### Tags:
        - ReadMe
        - Add-Bom-Tag
        - Tag
        - Extract Tag
        - CutLayout 
### Import-Export:
        - GCode
        - Import
        - Export
        - Github Molecule


## Shapes 


### Regular Polygon

The regular polygon atom creates a regular polygon shape. Regular polygons are regularly extruded to create a 3D shape.

<img width="821" alt="polygon-example" src="https://github.com/user-attachments/assets/3d5b3fb7-34d5-49fc-b2aa-821e5df7cea4">


### Circle

The circle atom creates a circle sketch on the XY plane. Circle shapes are commonly extruded to create cylinders.

<img width="1176" alt="circle-example" src="https://github.com/user-attachments/assets/7bdb9773-9f93-4ddf-ae6f-ef802a59259f">


### Rectangle

The rectangle atom creates a rectangle sketch on the XY plane. Rectangles are commonly extruded to make a 3D shape.

<img width="1252" alt="rectangle-example" src="https://github.com/user-attachments/assets/528c65fc-be71-47ec-be4d-874380d92ed3">


### Text

The text atom creates a basic sketch on the XY plane with a string of your choosing. Text is commonly extruded to make a 3D shape.

<img width="1203" alt="text-example" src="https://github.com/user-attachments/assets/8b63602f-c020-4f79-a7cd-b00fd311839d">


### Molecule

The molecule atom can contain any number of atoms in a useful configuration. To add inputs to the molecule, place an input atom within it.

<img width="428" alt="molecule-example" src="https://github.com/user-attachments/assets/82eea26c-5383-4556-b12e-95a3d2f92fa0" />

## Interactions

### Intersection

The intersection atom computes the area of intersection of two shapes and creates a new shape out of that area.

<img width="904" alt="intersection-example" src="https://github.com/user-attachments/assets/ce2bd3ff-f34a-452b-a270-bc104f8988a2" />


### Difference

The difference atom subtracts one shape from another.

<img width="931" alt="difference-example" src="https://github.com/user-attachments/assets/a0a61322-8c4b-4bf7-9a73-0b26e053154f" />


### Join 

#### Assembly

The assembly selector allows multiple shapes to be combined into one unit called an assembly. The order in which atoms are combigned matters because where shapes intersect shapes earlier in the order subtract from shapes later in the order. For example if you have a bolt which needs to create a hole in a part you should assemble first the part and then the bolt.

<img width="1162" alt="assembly-example" src="https://github.com/user-attachments/assets/49728e17-55dc-4924-a7fb-42a514ab755e">


#### Fusion

The fusion selector atom allows multiple shapes to be combined into one unit. The shapes are fused, become one and are inseparable from then on.

<img width="1126" alt="fusion-example" src="https://github.com/user-attachments/assets/8a91f7ff-55ca-4c03-ad02-dcf20ef04514">


### Shrinkwrap

The shrinkwrap atom combines multiple sketches into a single shape as if they had been shrinkwrapped. This is useful for creating shapes that would be difficult to create in other ways.

<img width="1051" alt="shrinkwrap-example" src="https://github.com/user-attachments/assets/70ea489c-7e4b-4501-a798-14c828af3a68" />


### Loft

<img width="940" alt="loft-example" src="https://github.com/user-attachments/assets/8ef7e0dd-38c3-42d9-bd21-db90da61d546" />


## Actions

### Color

The color atom gives color to a 2D or 3D shape.

<img width="890" alt="color-example" src="https://github.com/user-attachments/assets/4ac141c8-b401-4cae-9b9d-84affba28ad1" />


### Move

The move atom moves a 3D shape in 3D space or a 2D shape in 2D space.

{<img width="884" alt="move-example" src="https://github.com/user-attachments/assets/a8c1f8f7-b390-41fc-acd7-4bd7334ca6ba" />

### Extrude

The Extrude atom takes a 2D shape and makes it 3D.

<img width="886" alt="extrude-example" src="https://github.com/user-attachments/assets/c4f949b8-e87a-4a3c-a314-ea8d70e03180" />

### Rotate

The rotate atom rotates a shape along any of its three axis.

<img width="836" alt="rotate-example" src="https://github.com/user-attachments/assets/ae6097ad-07a4-4a14-b69b-23fda96b426b" />

### Scale

The scale function scales a 2D or 3D shape by a specified factor. A scale factor of 1.0 keeps the original size, 2.0 doubles the size, and 0.5 halves the size. The Scale function can be used in the Code atom and works with both individual geometries and assemblies.

Example usage in Code atom:
```javascript
// Scale a shape to 150% of its original size
let scaledShape = Scale(library[inputShape], 1.5);
return scaledShape;
```


## Tags

### README

The README atom provides notes to the next person reading the project. The text of the readme input is added to the readme page of the project (similar to this page you are reading now).

<img width="588" alt="readme-example" src="https://github.com/user-attachments/assets/5ca90c52-4341-4b96-bb9f-36dcc70ea744" />


### Tag

The tag atom adds a tag to a part which can be later used to retrieve that part from an assembly.

<img width="986" alt="tag-example" src="https://github.com/user-attachments/assets/3b8a5270-6e7e-4a9e-9309-2902602a2ee2" />


### Add BOM Tag

The Add BOM Tag atom tags a part with a bill of materials item. This item will appear in the project bill of materials one time each time the tagged part appears in the final shape. For example if you have a table leg that needs four bolts, and the final model has four table legs the bolt will automatically appear in the final bill of materials 16 times.

<img width="908" alt="bom-tag-example" src="https://github.com/user-attachments/assets/094216c3-26bb-4fb2-be46-62d3b4170d49" />
<img width="1014" alt="bom-molecule-example" src="https://github.com/user-attachments/assets/4cc3a257-262f-4145-8f7d-60ac10dfc9c6" />

## Inputs

### Input

The input atom lets you define which variables are inputs to your program. They function similar to constants, however when you share your project, the person on the other end will have the ability to change the values of the inputs. Inputs placed within a molecule will add inputs to that molecule up one level.

<img width="377" alt="inputs-example" src="https://github.com/user-attachments/assets/13d6bd15-8a2f-447d-8a2c-08ae5c250fd4" />
<img width="426" alt="inputs-molecule-example" src="https://github.com/user-attachments/assets/af7c01bd-1719-42bb-b166-4f6e3bb59fb6" />


### Code

The code atom allows you to enter arbitrary replicad code. For all available methods see replicad.xyz

<img width="1008" alt="code-example-1" src="https://github.com/user-attachments/assets/0617fda4-9adf-4a73-abba-7cd6cbb764f3" />
<img width="1001" alt="code-example-2" src="https://github.com/user-attachments/assets/8bf72007-5dfa-4529-8848-eac2cc022c65" />


### Constant

The constant atom defines a constant number that can be used to control multiple inputs.

<img width="818" alt="constant-example" src="https://github.com/user-attachments/assets/2fa19ffb-198b-4046-96c1-cb850735b815" />


### Equation

The equation Atom lets you perform basic math operations on numbers produced by constants.

<img width="872" alt="equation-example" src="https://github.com/user-attachments/assets/82a8915c-4085-42c9-915d-1f1b217bb34b" />


## Import/Export

### Gcode

### Import

The Import atom allows you to upload a STL, SVG, or STEP file. Complex models might take a long time to compute. 

<img width="986" alt="import-example" src="https://github.com/user-attachments/assets/76bef001-d2a9-4e79-83c4-3f83bec8e2f4" />

### Export

The export atom tags a part for export. An Export atom lets you download the selected part in a file format of your choosing and makes that part available for download in Run Mode

<img width="997" alt="export-example" src="https://github.com/user-attachments/assets/2107d6cd-2812-4131-9f37-df52173e0716" />

### GitHub Molecule

The GitHub atom type is not directly available. By clicking on the GitHub tab when placing a new Atom you can search for and add any other Abundance project to your project as a molecule.

<img width="1298" alt="github-example" src="https://github.com/user-attachments/assets/bb63bb29-4a9c-4b79-85bb-f2b32c00fa2d" />

## Output

The output atom cannot be directly placed however, each molecule has one output that can't be deleted. Connect a shape to the output of a molecule to make that shape available one level up. The output of the top-level molecule is the output of the project.

<img width="241" alt="output-example" src="https://github.com/user-attachments/assets/946feb6f-9ebe-4c47-958f-8a5407afe9ba" />



# Run Mode

If you are not the owner of a project or are not logged in, you can still see a project in Run Mode. 

<img width="1436" alt="run-mode" src="https://github.com/user-attachments/assets/c3bed30e-f253-4245-a62c-67067a5319ee">


# Development

You can read the complete documentation at ----(Documentation pending)

## How To Setup

1.  Clone the repo:

        git clone https://github.com/BarbourSmith/Abundance.git

2.  Install dependencies:

        npm install --legacy-peer-deps

3. Edit files for local development:

        Follow the comments in .env to switch to local develpment mode and in is vite config change /Abundance to / 

4.  Run webpack:

        npm start

Your canvas piece should open up automatically at http://localhost:4444 


