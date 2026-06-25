# Data licensing & attribution

This repository mixes **original source code** (MIT, see `LICENSE`) with
**data derived from third-party brain atlases**. The data are governed by the
licenses below, *not* by the MIT license. Please read this file before reusing
any data file in this repository.

---

## 1. Rat data — Waxholm Space (WHS) SD Rat Atlas v4  →  CC BY 4.0

All files under `rat/data/` (`rat_brain_mesh.json`, `rat_cortex_mesh.json`,
`rat_ontology.json`, `rat_electrodes.json`, `rat_bregma.json`) and any region
meshes regenerated into `rat/regions/` are **derivatives of the Waxholm Space
Atlas of the Sprague Dawley Rat Brain (version 4)**.

- **Source / download:** NITRC — <https://www.nitrc.org/projects/whs-sd-atlas>
- **License:** Creative Commons Attribution 4.0 International (**CC BY 4.0**) —
  <https://creativecommons.org/licenses/by/4.0/>
- **You may** share and adapt these files, including commercially, **provided
  you give attribution** to the Waxholm Space atlas (citations below).

These derivatives are re-shared here under the same **CC BY 4.0** license.

**Please cite:**
- Kleven H, Bjerke IE, Clascá F, Groenewegen HJ, Bjaalie JG, Leergaard TB
  (2023). *Waxholm Space atlas of the rat brain: a 3D atlas supporting data
  analysis and integration.* **Nature Methods** 20:1822–1829.
- Papp EA, Leergaard TB, Calabrese E, Johnson GA, Bjaalie JG (2014). *Waxholm
  Space atlas of the Sprague Dawley rat brain.* **NeuroImage** 97:374–386.
- Kjonigsen LJ, Lillehaug S, Bjaalie JG, Witter MP, Leergaard TB (2015).
  *Waxholm Space atlas of the rat brain hippocampal region…* **NeuroImage**
  108:441–449.
- Osen KK, Imad J, Wennberg AE, Papp EA, Leergaard TB (2019). *Waxholm Space
  atlas of the rat brain auditory system…* **NeuroImage** 199:38–56.

> The large original atlas volumes (`*.nii.gz`, the `_pack.zip`, T2*/FA images)
> are **not** committed here because of their size; download them from NITRC —
> see `docs/OBTAINING_DATA.md`.

---

## 2. Mouse region meshes — Allen Mouse Brain CCFv3  →  Allen Institute terms

The mouse anatomical region meshes (`mouse/regions/*.obj`) are **not stored in
this repository**. `tis_server.py` downloads each region on demand directly
from the Allen Institute's public server the first time it is viewed:

```
http://download.alleninstitute.org/informatics-archive/current-release/
mouse_ccf/annotation/ccf_2017/structure_meshes/<id>.obj
```

`mouse/data/allen_ontology.json` is the Allen CCFv3 structure dictionary.

- **Source:** Allen Institute for Brain Science — <https://atlas.brain-map.org/>
- **Terms of use:** <https://alleninstitute.org/terms-of-use/> (free for
  research use **with citation**).
- **Please cite:** Wang Q, et al. (2020). *The Allen Mouse Brain Common
  Coordinate Framework: A 3D Reference Atlas.* **Cell** 181(4):936–953.

---

## 3. Mouse brain surface — TIP.lite (IT'IS Foundation)  →  NOT redistributed

The mouse whole-brain and cortex surface meshes used by the viewer originate
from **TIP.lite**, a temporal-interference planning tool of the
**IT'IS Foundation** (<https://itis.swiss/tools-and-systems/ti-planning/>).
Its head models (e.g. MIDA, Mouse) are **proprietary IT'IS assets**.

To respect IT'IS's rights, the extracted surface meshes
(`mouse/data/brain_mesh.json` and the cortex mesh) are **deliberately excluded**
from this repository. Only the *extraction scripts* (in
`archive/data_extraction/`) and instructions (`docs/OBTAINING_DATA.md`) are
provided, so that users with their own authorized TIP.lite access can recreate
them locally. Do **not** redistribute IT'IS-derived surface meshes.

- IT'IS Foundation TI-Planning: <https://itis.swiss/tools-and-systems/ti-planning/>

---

## 4. Original electrode montage & code

The 36-channel electrode montage table (`rat/source/New RAT EEG.xlsx`,
materialized into `rat/data/rat_electrodes.json`) and all source code in this
repository are original work of the authors, released under the licenses above
(code: MIT; rat-derived data: CC BY 4.0).
