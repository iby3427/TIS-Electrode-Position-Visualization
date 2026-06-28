# Obtaining the data assets

To keep this repository small and to respect third-party licenses, the large
atlas volumes and the proprietary TIP.lite surfaces are **not** committed here.
This guide explains how to recreate everything locally.

After cloning, the repo already contains enough data to run the **Rat** viewer
(whole-brain surface, cortex mask, all 36 electrodes). Two things require extra
steps: rat **region** overlays, and the **Mouse** brain surface.

---

## A. Rat — Waxholm Space (WHS) SD Rat Atlas v4

The shipped `rat/data/*.json` files already let you see the rat brain, cortex,
and electrodes. To enable the **per-region anatomy overlay** (the 222 region
meshes in `rat/regions/`), regenerate them from the atlas:

1. Download the WHS SD Rat Atlas v4 from NITRC:
   - <https://www.nitrc.org/projects/whs-sd-atlas>
   - You need at least `WHS_SD_rat_atlas_v4.nii.gz` (label volume) and
     `WHS_SD_rat_atlas_v4.label` (region definitions).
2. Place them under:
   ```
   rat/source/WHS_SD_rat_atlas_v4_pack/
       WHS_SD_rat_atlas_v4.nii.gz
       WHS_SD_rat_atlas_v4.label
   ```
3. Regenerate all rat assets (meshes, ontology, electrodes):
   ```bash
   python rat/make_rat_assets.py
   ```
   This rebuilds `rat/data/*.json` and writes the 222 region `.obj` files into
   `rat/regions/`.

> License: WHS atlas is **CC BY 4.0** — attribution required. See
> `DATA_LICENSE.md` for the full citation list.

### Re-tuning the rat electrodes only (fast)

If you only want to nudge the bregma anchor, edit `BREGMA_Y` (and, if needed,
`ML_SIGN` / `AP_SIGN`) at the top of `rat/make_rat_assets.py`, then run:

```bash
python rat/retune_electrodes.py
```

---

## B. Mouse — Allen CCFv3 region meshes (automatic)

Nothing to do up front. The first time you add a mouse anatomical region in the
viewer, `tis_server.py` downloads that region's `.obj` from the Allen
Institute's public server and caches it in `mouse/regions/`. Internet access is
required only for that first download.

> License: Allen Institute terms of use, free for research **with citation**
> (Wang et al. 2020, Cell). See `DATA_LICENSE.md`.

---

## C. Mouse — TIP.lite brain surface (NOT redistributed)

The mouse whole-brain and cortex surface meshes come from **TIP.lite**, a tool
of the **IT'IS Foundation**. Its head models are proprietary, so the extracted
meshes are **not** shipped here. Without them, Mouse mode shows the electrodes
but no brain surface.

If you have your own **authorized** TIP.lite access, recreate the meshes:

1. Open your TIP.lite session with the **Mouse** head model loaded.
2. Open the browser developer console and run the extraction scripts in
   `archive/data_extraction/`:
   - `brain mesh downloading from TIPlite.js` → whole-brain surface
   - `brain mesh(red only) downloading from TIPlite.js` → cortex reference mask
3. Save the downloaded results as:
   ```
   mouse/data/brain_mesh.json
   mouse/data/(Targets_combined)Cerebral_Cortex_target_mesh.json
   ```
4. (Optional) Recompute the Allen→TIP registration matrix:
   ```bash
   python mouse/register_allen_to_tip.py
   ```

> Please do **not** redistribute IT'IS-derived surface meshes. See
> `DATA_LICENSE.md` §3.

---

## D. Rat — 2D MRI cross-section viewer (optional)

The **2D MRI 슬라이스** button (Rat mode) overlays three orthogonal MRI cross-sections
(sagittal / coronal / axial) on the 3D brain, with the atlas regions color-coded and
hover-to-identify. The slice images are generated from the WHS **T2\*** MRI and are
**local-only** (~60 MB, not committed). To enable the viewer:

1. Download from NITRC (<https://www.nitrc.org/projects/whs-sd-atlas>) into
   `rat/source/WHS_SD_rat_atlas_v4_pack/`:
   - `WHS_SD_rat_T2star_v1.01.nii.gz` (the grayscale MRI, ~900 MB)
   - `WHS_SD_rat_atlas_v4.nii.gz` + `WHS_SD_rat_atlas_v4.label` (region labels/colors)
2. Install Pillow if needed: `pip install Pillow`
3. Generate the slices:
   ```bash
   python rat/make_rat_slices.py
   ```
   This writes `rat/data/slices/{sag,cor,axi}/*.png` and `rat/data/rat_slices.json`
   (both gitignored). Reload the viewer — the **2D MRI 슬라이스** button now appears in
   Rat mode. Without these assets the button stays hidden and the rest of the viewer
   works normally.

> License: WHS T2\* MRI is **CC BY 4.0** (attribution). See `DATA_LICENSE.md`.
