---
title: "Choosing the TI for LGE and EGE (PSIR) in Cardiac MRI"
shortTitle: "Choosing the TI time for PSIR"
summary: "How to choose the inversion time (TI) for PSIR in LGE and EGE imaging, how LGE and EGE differ, and why a long TI around 600 ms right after injection shows thrombus and MVO."
topics: [technique]
published: 2025-12-04
updated: 2025-12-12
cover: ../images/51892d_62f8008801954f4d8a8ba16d82a81d38-mv2.webp
sourceUrl: https://cardiacmrihub.wixsite.com/cardiac-mri-hub/post/choosing-the-right-ti-time-for-psir-imaging-in-cardiac-mri-understanding-lge-and-ege-techniques
---

Choosing the inversion time (TI) for phase-sensitive inversion recovery (PSIR) is one of the trickier parts of late gadolinium enhancement (LGE) and early gadolinium enhancement (EGE). The TI decides what shows up black and what shows up bright. This guide covers how to choose it, how LGE and EGE differ, and why a long TI around 600 ms is used right after injection.

![Close-up view of cardiac MRI scanner console showing TI time settings](../images/51892d_fcd363820a744125b63e2dbd8b945ba1-mv2.webp)

# What the TI does

The TI is the delay between the inversion pulse and the readout. It decides which tissue is nulled (black), based on its T1. In cardiac MRI it's set to null normal myocardium, so fibrosis and scar show up bright.

- **TI too short:** normal myocardium looks bright, so there's less contrast with scar.
- **TI too long:** scar signal can be suppressed, and disease can be missed.

PSIR uses the phase information to improve contrast, so the exact TI matters less. It still matters.

![Short axis images shown above top row TI 600 and bottom row TI nulled to myocardium, images on left are magnitude images and PSIR on right.](../images/51892d_0f11c65e77f546798ca7f6e4fc66937b-mv2.webp "Short axis images shown above top row TI 600 and bottom row TI nulled to myocardium, images on left are magnitude images and PSIR on right.")

![Short axis LGE image above showing enhancement magnitude image on left and PSIR on right,](../images/51892d_9bb10fcc5e634e98bec61177d7e08f1c-mv2.webp "Short axis LGE image above showing enhancement magnitude image on left and PSIR on right,")

# LGE and EGE

## Late Gadolinium Enhancement (LGE)

LGE is done 10 minutes after gadolinium. By then, gadolinium has collected where the myocardium is damaged or fibrotic, because there's more extracellular space. It shortens T1 there, so those areas look bright.

- **Purpose:** infarction, fibrosis and scar.
- **TI:** set to null normal myocardium, usually 250–350 ms depending on the scanner and the patient.

## Early Gadolinium Enhancement (EGE)

EGE is done in the first few minutes after injection, usually 1–3 minutes, while the blood and myocardium are still full of contrast.

- **Purpose:** thrombus and microvascular obstruction (MVO), especially after a recent heart attack.
- **TI:** a long, fixed TI, around 600 ms. At that TI, tissue with little or no contrast in it, such as thrombus and MVO, is nulled (black), while the blood and myocardium stay bright.

![Eye-level view of cardiac MRI scan showing LGE image with bright scar tissue](../images/51892d_e87312e0691d4e1983567806a160835a-mv2.webp)

# Why a long TI right after injection

Right after injection, the blood and myocardium both have short T1s because they're full of contrast. Thrombus and MVO take up little or no contrast, so their T1 stays long. A TI around 600 ms is long enough to null that long-T1 tissue:

- **Thrombus and MVO:** nulled, so they show up black against the bright blood pool and enhanced myocardium. This is the main reason for the long TI.
- **Blood and myocardium:** stay bright, because after contrast their T1 is much shorter than 600 ms.
- **Consistency:** a fixed TI keeps the early phase quick and simple, with no TI scout needed.

LGE is different: the TI is set for each patient to null normal myocardium, so scar stands out bright.

# Tips for choosing the TI

1. **Start with a TI scout (Look-Locker)**  
   Use it to find the TI that nulls normal myocardium, especially for LGE.
   - EGE (within 3 minutes): a long TI, about 600 ms, to null thrombus and MVO.
   - LGE (10 minutes after injection): set the TI to null myocardium, usually 250–350 ms.
2. **Adjust the TI as time passes after injection**
3. **Consider the patient**
   - Kidney function and contrast clearance change T1.
   - Heart rate and rhythm affect timing and image quality.
4. **Use PSIR to reduce TI sensitivity**  
   PSIR depends less on the exact TI. That gives some leeway, but doesn't replace choosing the TI properly.
5. **Check the images right away**  
   For LGE, make sure normal myocardium is nulled. If not, repeat the TI scout or adjust the TI by hand.

# In short

For LGE at 10 minutes, set the TI for each patient (usually 250–350 ms) to null normal myocardium so scar stands out. For EGE at 1–3 minutes, a long, fixed TI around 600 ms nulls thrombus and microvascular obstruction, which show up black against the bright blood and myocardium. Use the TI scout for LGE, and check the nulling before moving on.
