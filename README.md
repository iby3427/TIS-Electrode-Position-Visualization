# TIS – Electrode Position Visualization

An interactive **3D web viewer** for EEG/10‑20 electrode montages on **mouse**
and **rat** brains, built for **Temporal Interference Stimulation (TIS)**
planning. It shows the whole-brain surface, anatomical regions, and a
36-channel electrode montage together, and lets you explore electrode pairs
(CH1± / CH2±) for TIS targeting. Rendering runs entirely in the browser
(Three.js / WebGL); a thin Flask server only serves data.

> **The point of this project.** Rat EEG montages are reported *inconsistently*
> across the literature — different electrode counts, different coordinate
> conventions, and no shared 3D atlas frame. This tool defines a **single,
> reproducible, atlas-anchored** rat montage by transferring a mouse 10‑20
> montage onto the **Waxholm Space (WHS) rat atlas**, with explicit stereotaxic
> coordinates and a deterministic placement rule. See
> [Why this matters](#why-this-matters-standardizing-the-rat-eeg-montage).

---

## Quick start

> New to Python or the terminal? Jump to the
> [Step-by-step guide for first-time users](#step-by-step-guide-first-time-users)
> instead — it walks through every command from scratch.

```bash
pip install -r requirements.txt    # viewer only needs `flask`
python tis_server.py               # → http://127.0.0.1:8050
```

Use the **Species** dropdown (top-left) to switch **Mouse ↔ Rat**.

- **Rat** mode works out of the box: brain surface, cortex mask, and all 36
  electrodes are shipped as derived data. The per-region anatomy overlay
  requires regenerating region meshes — see [docs/OBTAINING_DATA.md](docs/OBTAINING_DATA.md).
- **Mouse** mode shows electrodes immediately, but the **brain surface mesh is
  not shipped** (it is a proprietary TIP.lite / IT'IS Foundation asset — see
  [Data sources & licensing](#data-sources--licensing)). Recreate it from your
  own authorized TIP.lite session: [docs/OBTAINING_DATA.md](docs/OBTAINING_DATA.md).

---

## Step-by-step guide (first-time users)

Never used Python or a terminal before? Follow these steps exactly and you will
have the **Rat** viewer running in a few minutes. You do **not** need to download
any atlas first — the rat brain, cortex, and all 36 electrodes are already in
this repository.

### What you'll see

A 3D rat brain you can rotate with the mouse, with the full **36-channel
electrode montage** drawn on its surface. (Switching to **Mouse** also works, but
the mouse *brain surface* is proprietary and not shipped — see step 6.)

### 0. Install the two things you need

1. **Python 3.9 or newer.** Download it from <https://www.python.org/downloads/>.
   On Windows, **tick "Add Python to PATH"** in the installer — this one checkbox
   saves most beginner headaches. Verify it worked by opening a terminal
   (Windows: *PowerShell*; macOS/Linux: *Terminal*) and running:
   ```bash
   python --version
   ```
   If that prints `command not found`, try `python3 --version` instead and use
   `python3` everywhere below.
2. **Git** (optional). From <https://git-scm.com/downloads>. If you'd rather not
   install Git, you can skip it and download the project as a ZIP in step 1.

### 1. Get the project onto your computer

**With Git** (recommended — replace the URL with this repo's address):
```bash
git clone https://github.com/<your-username>/TIS-Electrode-Position-Visualization.git
cd TIS-Electrode-Position-Visualization
```

**Without Git:** on the GitHub page click the green **Code** button → **Download
ZIP**, unzip it, then open a terminal *inside* the unzipped folder.

> Tip: not sure you're in the right folder? Run `ls` (macOS/Linux) or `dir`
> (Windows). You should see `tis_server.py` and `README.md` in the listing.

### 2. (Recommended) Create an isolated environment

This keeps the project's packages from clashing with anything else on your
machine. It's optional but good practice:
```bash
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate
```
Your prompt should now start with `(.venv)`.

### 3. Install the one required package

The viewer itself only needs **Flask**:
```bash
pip install -r requirements.txt
```
(If `pip` isn't found, use `python -m pip install -r requirements.txt`.)

### 4. Start the viewer

```bash
python tis_server.py
```
You'll see a line like `Running on http://127.0.0.1:8050`. Leave this terminal
open — it's the server. To stop it later, press **Ctrl + C**.

### 5. Open it in your browser

Go to **<http://127.0.0.1:8050>**. You should see the 3D rat brain with
electrodes. Drag to rotate, scroll to zoom, and use the **Species** dropdown
(top-left) to switch **Mouse ↔ Rat**. That's the whole project running. 🎉

### 6. Optional — unlock the rest of the data

Everything above runs on the data already in the repo. Two extras need a
download or a special license, and **both are fully optional**:

| You want… | What to do |
|---|---|
| The rat **per-region anatomy overlay** (222 labeled WHS regions) | Download the free **Waxholm Space SD Rat Atlas v4** and run one script — see [docs/OBTAINING_DATA.md](docs/OBTAINING_DATA.md) §A. |
| Mouse **region meshes** (Allen) | Nothing to do — they auto-download the first time you add a mouse region in the viewer. |
| The mouse **brain surface** | Proprietary **TIP.lite** asset, not shipped. Recreate it only if you have your own authorized TIP.lite access — see [docs/OBTAINING_DATA.md](docs/OBTAINING_DATA.md) §C. |

### Troubleshooting

| Problem | Fix |
|---|---|
| `python: command not found` | Use `python3` instead (and `python3 -m pip …`). On Windows, reinstall Python with **"Add to PATH"** ticked. |
| `pip: command not found` | Run `python -m pip install -r requirements.txt`. |
| `Address already in use` / port 8050 busy | Another program (or a previous run) holds the port. Close the old terminal, or edit the port at the bottom of [tis_server.py](tis_server.py). |
| Browser page is blank | Make sure the `python tis_server.py` terminal is still running, and open the exact address `http://127.0.0.1:8050`. |
| Rat brain shows but anatomy regions don't | Expected — region overlays need step 6 §A. |

---

## Why this matters: standardizing the rat EEG montage

Scalp EEG in humans has a universal reference frame — the international 10‑20
system. **Rodent EEG has no such standard.** When researchers want a
"10‑20‑like" montage on a rat, each lab re-invents the placement, and the
published descriptions diverge in three ways at once: **how many** electrodes,
**where** they sit, and **in what coordinate frame** the positions are reported.
Compare three representative rat/mouse studies:

| Study | Species | Electrodes | Placement basis | Coordinate frame |
|---|---|---|---|---|
| Han et al. 2022, *Sci Data* | Mouse | 38 HD-EEG array (+4 screws) | High-density grid over dorsal skull | Skull/stereotaxic, study-specific |
| Piorecka et al. 2025, *Transl Psychiatry* | Rat | 21 gold electrodes | Frontal/parietal/temporal, "homologous to human 10‑20" | Paxinos rat atlas |
| Páleníček et al. 2011, *Neuropsychobiology* | Rat | 12 electrodes | Frontal/parietal/temporal cortex | Stereotactic atlas |

All three describe their montage as "10‑20‑homologous" or high-density, yet a
reader **cannot reconstruct one montage from another**: the counts differ
(12 vs 21 vs 38), the anatomical coverage differs, and the coordinates live in
incompatible, often paper-internal frames. None is expressed in a shared,
openly available **3D digital atlas** where positions can be visualized,
checked against anatomy, and reused.

**This project's contribution** is to fix the rat montage to a public 3D atlas.
We take a mouse 10‑20 montage and transfer it to the **Waxholm Space SD Rat
Atlas v4**, producing a **36-channel rat montage** in which every electrode has:

- an explicit **stereotaxic AP / ML coordinate (mm, bregma-referenced)**,
- a **deterministic dorsal-surface (DV) rule**, and
- a position **anchored in WHS atlas space**, so it can be rendered, inspected
  against labeled anatomy, and reproduced exactly by anyone.

The full montage table lives in [rat/data/rat_electrodes.json](rat/data/rat_electrodes.json)
(36 channels: AF/F/FC/C/CP/P/PO/O families across both hemispheres).

---

## Methodology: transferring the mouse 10‑20 montage to the rat

The rat placement pipeline is implemented in
[rat/make_rat_assets.py](rat/make_rat_assets.py). It is built around three
decisions, each made to maximize reproducibility and anatomical fidelity.

### 1. Start from the mouse frame (TIP.lite voxel space)

The mouse montage is defined in **TIP.lite voxel space**: axes are
`x = DV` (dorsal→ventral), `y = ML` (right→left), `z = AP` (anterior→posterior),
with **bregma at `z = 174.45, y = 93.5`**. Voxels are converted to physical mm
using Paxinos-based scales (**AP ≈ 0.10 mm/voxel, ML ≈ 0.08 mm/voxel**), giving
each mouse electrode a bregma-referenced stereotaxic AP/ML.
(See `calcBregmaMouse` in [web/main.js](web/main.js).)

### 2. Transfer the montage as stereotaxic AP/ML — by anisotropic brain-size scaling

The rat brain is much larger than the mouse brain and the WHS volume has its own
voxel size, origin, and bounding box, so naively plotting mouse voxel
coordinates over the rat mesh does **not** fit the rat skull. Instead, what is
transferred is the montage's **10‑20 labels and topological arrangement**: each
electrode's mouse stereotaxic **AP/ML (mm, bregma-referenced)** is rescaled to
the rat by an **anisotropic brain-size factor**, then stored in
[rat/source/New RAT EEG.xlsx](rat/source/New%20RAT%20EEG.xlsx) and materialized
into [rat/data/rat_electrodes.json](rat/data/rat_electrodes.json).

**Estimated brain dimensions and scale factors.** Over the dorsal cortical area
covered by the montage, the electrode array spans roughly:

| | Mouse | Rat | Rat ÷ Mouse |
|---|---:|---:|:--:|
| AP span (anterior–posterior) | ≈ 6.9 mm | ≈ 10.3 mm | **× 1.49** |
| ML span (full L–R width) | ≈ 6.1 mm | ≈ 13.6 mm | **× 2.23** |

So the transfer is, per electrode:

```
rat_AP = mouse_AP × 1.49        # rat brain ~1.5× longer
rat_ML = mouse_ML × 2.23        # rat brain ~2.2× wider (relatively much wider)
```

These two factors capture the key anatomical fact that the rat brain is not a
uniformly enlarged mouse brain — it is **proportionally far wider (ML) than it
is longer (AP)**. Using a single isotropic scale would have placed the lateral
electrodes incorrectly. The per-electrode ratios are tight (AP 1.48–1.51, ML
2.15–2.31), confirming the montage scales cleanly rather than being placed ad
hoc. The exact mouse-vs-rat coordinates are tabulated
[below](#the-36-channel-montage-mouse-vs-rat-coordinates).

### 3. Anchor to WHS and project to the dorsal "skull cap"

The WHS atlas origin is the **anterior commissure (AC)**, not bregma. To place
stereotaxic (bregma-referenced) coordinates into WHS millimeter space, the
pipeline applies a small AP offset between AC and bregma:

```
x_whs = ML_SIGN * ml + BREGMA_X      # BREGMA_X = 0.0  (midline)
y_whs = AP_SIGN * ap + BREGMA_Y      # BREGMA_Y = -0.4 mm  (AC → bregma AP offset)
```

`ML_SIGN` / `AP_SIGN` make the left↔right and anterior↔posterior orientation
checks explicit and easy to correct.

The **dorsal (DV) height** is *not* taken from the brain mesh directly. Scalp/
skull electrodes sit on the **skull**, which is wider than the brain and lies
outside its sulci and ventral concavities. Projecting onto the brain surface
would let electrodes sink into folds or fall off the lateral edges. Instead, the
pipeline builds the **convex hull of the dorsal surface point cloud** — a smooth
"skull cap" height function (`build_dorsal_cap`) — and places each electrode on
that cap, lifted by `SURFACE_OFFSET_MM = 0.25 mm`:

```
z_whs = cap_z(x_whs, y_whs) + SURFACE_OFFSET_MM
```

This yields electrodes that wrap smoothly over the whole dorsal surface,
including the anterior and lateral edges, without penetrating the brain.

### The 36-channel montage: mouse vs. rat coordinates

The table records each channel in **both** frames, kept separate:

- **Mouse (source)** — stereotaxic AP/ML in mm from bregma, derived from the
  TIP.lite voxel positions in [web/main.js](web/main.js) via
  `AP = (z − 174.45)·0.10`, `ML = (y − 93.5)·0.08`.
- **Rat (transferred)** — stereotaxic AP/ML in mm from bregma, i.e. mouse
  AP × 1.49 and ML × 2.23, as materialized in
  [rat/data/rat_electrodes.json](rat/data/rat_electrodes.json).

AP > 0 = anterior; ML sign follows the hemisphere (− = left / + = right).
**WHS z** is the final dorsal skull-cap height in atlas mm. (The other two WHS
axes are trivial: WHS x = rat ML, WHS y = rat AP − 0.4 mm.)

| Ch | Hemi | Mouse AP | Mouse ML | → | Rat AP | Rat ML | WHS z |
|----|:----:|------:|------:|:--:|------:|------:|------:|
| AF3 | L | 2.97 | −1.67 | → | 4.43 | −3.64 | 6.641 |
| AF4 | L | 2.89 | −1.16 | → | 4.31 | −2.50 | 7.109 |
| AF7 | R | 2.95 | 1.17 | → | 4.40 | 2.70 | 7.008 |
| AF8 | R | 2.97 | 1.56 | → | 4.44 | 3.59 | 6.689 |
| F1 | L | 1.96 | −1.94 | → | 2.92 | −4.23 | 6.797 |
| F2 | L | 2.01 | −1.14 | → | 3.01 | −2.46 | 7.266 |
| F5 | R | 2.01 | 1.17 | → | 3.00 | 2.70 | 7.344 |
| F6 | R | 2.02 | 1.69 | → | 3.03 | 3.86 | 7.031 |
| FC1 | L | 0.94 | −2.46 | → | 1.40 | −5.41 | 6.680 |
| FC2 | L | 1.06 | −1.35 | → | 1.58 | −2.91 | 7.539 |
| FC5 | R | 0.93 | 1.31 | → | 1.38 | 3.02 | 7.656 |
| FC6 | R | 1.03 | 2.50 | → | 1.53 | 5.66 | 6.484 |
| C1 | L | −0.03 | −2.69 | → | −0.04 | −5.91 | 6.797 |
| C2 | L | −0.02 | −1.90 | → | −0.04 | −4.14 | 7.617 |
| C3 | L | −0.09 | −1.14 | → | −0.13 | −2.45 | 8.047 |
| C4 | R | −0.08 | 1.10 | → | −0.11 | 2.54 | 8.164 |
| C5 | R | 0.00 | 1.93 | → | −0.01 | 4.39 | 7.695 |
| C6 | R | 0.03 | 2.70 | → | 0.05 | 6.13 | 6.602 |
| CP1 | L | −1.01 | −2.81 | → | −1.50 | −6.18 | 6.875 |
| CP2 | L | −0.93 | −2.17 | → | −1.38 | −4.75 | 7.734 |
| CP3 | L | −1.00 | −1.30 | → | −1.50 | −2.80 | 8.281 |
| CP4 | R | −0.95 | 1.34 | → | −1.41 | 3.09 | 8.320 |
| CP5 | R | −0.97 | 2.14 | → | −1.46 | 4.86 | 7.734 |
| CP6 | R | −0.94 | 2.87 | → | −1.41 | 6.50 | 6.562 |
| P1 | L | −1.97 | −3.03 | → | −2.94 | −6.68 | 6.680 |
| P2 | L | −1.95 | −2.35 | → | −2.92 | −5.16 | 7.852 |
| P3 | L | −1.95 | −1.34 | → | −2.92 | −2.91 | 8.477 |
| P4 | R | −1.94 | 1.36 | → | −2.89 | 3.11 | 8.555 |
| P5 | R | −1.93 | 2.34 | → | −2.89 | 5.30 | 7.773 |
| P6 | R | −1.94 | 3.05 | → | −2.89 | 6.91 | 6.641 |
| PO3 | L | −2.92 | −2.09 | → | −4.37 | −4.57 | 8.203 |
| PO4 | L | −2.91 | −1.33 | → | −4.34 | −2.88 | 8.633 |
| PO7 | R | −2.93 | 1.38 | → | −4.37 | 3.18 | 8.711 |
| PO8 | R | −2.97 | 1.91 | → | −4.44 | 4.34 | 8.398 |
| O1 | L | −3.93 | −1.32 | → | −5.86 | −2.86 | 8.633 |
| O2 | R | −3.90 | 1.30 | → | −5.83 | 3.00 | 8.711 |

> WHS z comes from `cap_z(rat_x, rat_y) + 0.25 mm`. Re-run
> [rat/retune_electrodes.py](rat/retune_electrodes.py) after changing the anchor
> to regenerate the WHS positions.

### Why these choices

- **Reproducibility** — every electrode is a published number (AP/ML mm) plus a
  deterministic surface rule, so the montage can be reproduced exactly.
- **Atlas-anchoring** — positions live in WHS space and can be checked against
  the 222 labeled WHS regions, instead of an opaque paper-internal frame.
- **Comparability** — bregma-referenced stereotaxic coordinates connect directly
  to the stereotaxic-atlas conventions used in the rat literature.
- **Anatomical fidelity** — the skull-cap projection mirrors how real surface
  electrodes sit on the skull rather than on the brain.

### Tuning the anchor

The AC→bregma offset is the main visual tuning knob. Edit `BREGMA_Y` (and, if an
orientation looks flipped, `ML_SIGN` / `AP_SIGN`) at the top of
[rat/make_rat_assets.py](rat/make_rat_assets.py), then run the fast re-projection:

```bash
python rat/retune_electrodes.py
```

---

## Coordinate systems at a glance

| | Mouse | Rat |
|---|---|---|
| Space | TIP.lite voxel (`x=DV, y=ML, z=AP`) | WHS physical mm (origin = anterior commissure) |
| Region meshes | Allen CCFv3, in µm → mapped to TIP voxel via a 4×4 matrix ([mouse/data/allen_to_tip_transform.json](mouse/data/allen_to_tip_transform.json)) | Already in WHS mm — **no transform needed** |
| Bregma | `z = 174.45, y = 93.5`; AP 0.10, ML 0.08 mm/voxel | AC + `BREGMA_Y = -0.4 mm` AP offset |
| Electrode DV | from extracted montage | dorsal convex-hull "skull cap" + 0.25 mm |

---

## Repository layout

```
TIS-Electrode-Position-Visualization/
├─ tis_server.py             Flask data server (entry point)
├─ web/
│   ├─ index.html            UI layout + styling
│   └─ main.js               Three.js scene, electrodes, regions, tooltips, species toggle
├─ mouse/                    🐭 Allen CCFv3 × TIP.lite
│   ├─ data/                 allen_ontology.json, allen_to_tip_transform.json
│   │                        (brain/cortex surfaces NOT shipped — see OBTAINING_DATA)
│   ├─ regions/              Allen .obj cache (auto-downloaded on demand)
│   └─ register_allen_to_tip.py   Allen → TIP registration (trimmed-ICP)
├─ rat/                      🐀 Waxholm Space SD Atlas v4
│   ├─ data/                 rat_brain_mesh / rat_cortex_mesh / rat_ontology /
│   │                        rat_electrodes / rat_bregma  (CC BY 4.0 derivatives)
│   ├─ regions/              222 region meshes (regenerated — not shipped)
│   ├─ source/               New RAT EEG.xlsx (montage input); atlas NOT shipped
│   ├─ make_rat_assets.py    NIfTI → meshes, ontology, electrodes (full build)
│   └─ retune_electrodes.py  fast electrode re-projection (bregma tuning)
├─ archive/data_extraction/  TIP.lite / Allen extraction scripts (provenance)
├─ docs/                     OBTAINING_DATA.md, methodology notes
├─ README.md  DATA_LICENSE.md  LICENSE  requirements.txt  .gitignore
```

---

## Asset regeneration

```bash
# Mouse: recompute the Allen → TIP registration matrix
python mouse/register_allen_to_tip.py

# Rat: full asset rebuild from the WHS NIfTI (several minutes)
python rat/make_rat_assets.py

# Rat: re-place electrodes only (bregma tuning, seconds)
python rat/retune_electrodes.py
```

See [docs/OBTAINING_DATA.md](docs/OBTAINING_DATA.md) for where to download the
source atlas and how to recreate the proprietary mouse surface.

---

## Data sources & licensing

This repository combines **original code** (MIT) with **data derived from
third-party atlases**, each under its own license. Full details and citations
are in [DATA_LICENSE.md](DATA_LICENSE.md). In short:

| Asset | Source | License | In repo? |
|---|---|---|---|
| Rat brain / cortex / region / electrode data | **Waxholm Space SD Rat Atlas v4** (NITRC) | **CC BY 4.0** (attribution) | ✅ derived JSON shipped; atlas volumes excluded (size) |
| Mouse region meshes + ontology | **Allen Mouse Brain CCFv3** | Allen Institute terms (free, cite) | ⤓ region `.obj` auto-downloaded on demand |
| Mouse brain / cortex surface | **TIP.lite (IT'IS Foundation)** | Proprietary | ❌ **not redistributed** — recreate locally |
| Electrode montage + source code | This project | MIT (code) / CC BY 4.0 (rat data) | ✅ |

**Please cite when you use the data:**

- **Rat atlas** — Kleven H, et al. (2023). *Waxholm Space atlas of the rat
  brain: a 3D atlas supporting data analysis and integration.* **Nature
  Methods** 20:1822–1829. (and Papp et al. 2014; Kjonigsen et al. 2015; Osen et
  al. 2019 — see [DATA_LICENSE.md](DATA_LICENSE.md)).
- **Mouse atlas** — Wang Q, et al. (2020). *The Allen Mouse Brain Common
  Coordinate Framework: A 3D Reference Atlas.* **Cell** 181(4):936–953.
- **TIP.lite** — IT'IS Foundation, TI-Planning tools
  (<https://itis.swiss/tools-and-systems/ti-planning/>).

**Montage-context references** (rodent EEG placement, discussed above):

- Han H-B, et al. (2022). *Nine-day continuous recording of EEG and 2-hour of
  high-density EEG under chronic sleep restriction in mice.* **Scientific Data**
  9:225.
- Piorecka V, et al. (2025). *Microstate in rats' EEG: a proof of concept
  study.* **Translational Psychiatry** 15:494.
- Páleníček T, et al. (2011). *Electroencephalographic spectral and coherence
  analysis of ketamine in rats…* **Neuropsychobiology** 63(4):202–218.

---

## License

- **Source code:** MIT — see [LICENSE](LICENSE).
- **Rat data derivatives:** CC BY 4.0 (Waxholm Space attribution required).
- **Mouse TIP.lite surfaces:** proprietary (IT'IS Foundation), not included.

See [DATA_LICENSE.md](DATA_LICENSE.md) for the complete breakdown.
