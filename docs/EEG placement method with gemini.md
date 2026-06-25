# Project Handoff: 10-20 EEG Electrode Placement & Registration for Rat Brain Model

## 1. Project Overview
* **Objective:** Expand our existing in-silico Temporal Interference Stimulation (TIS) 3D navigator to support a **Rat model** (Sprague Dawley), specifically scaling and mapping 36 standard 10-20 EEG electrodes onto the rat brain surface.
* **Background:** We have already successfully implemented this for a Mouse model using data extracted from the "TIP-lite" simulator. We are now pivoting to apply these methodologies to the **NITRC Waxholm Space (WHS) Rat Atlas**.

## 2. Methodology Applied to the Mouse Model (For Reference)
To help you understand our approach, here is how we successfully mapped the Mouse EEG electrodes:

### A. Data Extraction & Coordinate System
* We extracted the 3D voxel coordinates of 36 EEG electrodes (e.g., C1, C3, FC2, CP2) and the brain surface mesh directly from the TIP-lite simulator.
* **TIP-lite Voxel Space Axes:**
  * **X-axis (DV):** Dorsal to Ventral (approx. 75 to 150)
  * **Y-axis (ML):** Right to Left (approx. 51 to 135, Midline = 93.0)
  * **Z-axis (AP):** Anterior to Posterior (Reversed direction: 228 to 74, Bregma = 174.45)

### B. Physical Scaling Calculation (Voxel to mm)
* Because TIP-lite used an arbitrary voxel space, we calculated the scaling factor to physical millimeters (mm) based on the Paxinos Mouse Atlas.
* **Calculated Mouse Scale:** * AP Scale $\approx$ 0.10 mm/voxel
  * ML Scale $\approx$ 0.08 mm/voxel
* By setting Bregma (Z=174.45, Y=93.0) as the origin (0,0), we accurately projected the electrodes onto the physical mouse skull.

## 3. Current Efforts & Progress for the Rat Model
We are now transitioning to the **Rat (NITRC WHS)** model. Here is what has been done so far:

1. **Acquired Rat Atlas:** Downloaded the `WHS_SD_rat_atlas_v4.nii.gz` (NIfTI volume) from NITRC.
2. **Mesh Extraction:** Wrote a Python script using the `marching_cubes` algorithm (`skimage.measure`) to extract the 3D surface mesh from the NIfTI volume, saving it as `rat_brain.obj`.
3. **UI Integration:** Built a Dash/Plotly dual-mode toggle (Mouse ↔ Rat). Currently, `rat_brain.obj` loads in the viewer, but the 36 EEG electrodes are still using the TIP-lite *Mouse* voxel coordinates.

## 4. The Challenge (Why we need your help)
The Rat brain is significantly larger than the Mouse brain, and the NITRC WHS NIfTI file has its own unique coordinate system (voxel size, origin, and bounding box). 

If we simply plot the 36 mouse EEG coordinates over the `rat_brain.obj`, they do not fit the rat's skull curvature or physical dimensions. We attempted a temporary heuristic scale for the rat (AP: 0.1494, ML: 0.1786), but the electrode array needs a rigorous mathematical transformation to wrap perfectly around the WHS Rat mesh.

## 5. Immediate Action Items for Claude
1. **Analyze Rat WHS Space:** Determine the physical dimensions and Bregma origin of the NITRC WHS SD Rat Atlas v4 (usually isotropic 39 µm or similar).
2. **Electrode Scaling & Projection Algorithm:** Develop a mathematical methodology (Affine transformation or spherical projection) to expand our existing 36 Mouse EEG coordinates to fit the physical dimensions of the `rat_brain.obj`. 
   * *Goal:* The 10-20 system must maintain its proportional anatomical integrity (e.g., C1 to C2 crossing the midline appropriately) while wrapping tightly over the larger rat brain mesh.
3. **Write the Python Implementation:** Provide the Python function that takes the base 36 coordinates (from the Mouse array) and transforms them into the corresponding WHS Rat coordinates, ensuring they render correctly on the Plotly 3D scatter plot.