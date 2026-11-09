---
title: "Choosing the TI for LGE and EGE (PSIR) in Cardiac MRI"
shortTitle: "Choosing the TI time for PSIR"
summary: "How to choose the inversion time (TI) for PSIR in LGE and EGE imaging, how LGE and EGE differ, and why a TI around 600 ms is used right after injection."
topics: [technique]
published: 2025-12-04
updated: 2025-12-12
cover: ../images/51892d_62f8008801954f4d8a8ba16d82a81d38-mv2.webp
sourceUrl: https://cardiacmrihub.wixsite.com/cardiac-mri-hub/post/choosing-the-right-ti-time-for-psir-imaging-in-cardiac-mri-understanding-lge-and-ege-techniques
---

Choosing the inversion time (TI) for phase-sensitive inversion recovery (PSIR) is one of the trickier parts of late gadolinium enhancement (LGE) and early gadolinium enhancement (EGE). The TI decides whether scar or fibrosis stands out. This guide covers how to choose it, how LGE and EGE differ, and why a TI of 600 ms can be used right after injection.

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

LGE is done 10 to 20 minutes after gadolinium. By then, gadolinium has collected where the myocardium is damaged or fibrotic, because there's more extracellular space. It shortens T1 there, so those areas look bright.

- **Purpose:** infarction, fibrosis and scar.
- **TI:** set to null normal myocardium, usually 250–350 ms depending on the scanner and the patient.

## Early Gadolinium Enhancement (EGE)

EGE is done in the first few minutes after injection, usually 1–3 minutes. It shows the early distribution of gadolinium in the blood and myocardium.

- **Purpose:** perfusion and inflammation.
- **TI:** often fixed around 600 ms right after injection, to null the blood pool and show hyperemia or edema.

![Eye-level view of cardiac MRI scan showing LGE image with bright scar tissue](../images/51892d_e87312e0691d4e1983567806a160835a-mv2.webp)

# Why TI 600 ms right after injection

Right after injection, the blood has a very short T1 because the contrast is concentrated. A TI around 600 ms nulls the blood signal, which EGE needs to separate blood from myocardium.

- **Blood pool nulling:** TI 600 ms suppresses the blood, so myocardial enhancement is easier to see.
- **Myocardium:** early on, myocardium has a longer T1 than blood, so it looks brighter than the nulled blood.
- **Consistency:** a fixed 600 ms keeps the protocol simple and quick in the early phase.
- **Thrombus and MVO:** TI 600 ms is especially useful for acute thrombus and microvascular obstruction (MVO) after a recent heart attack. They look dark against the bright blood pool and enhanced myocardium.

LGE is different: the TI is set for each patient to null normal myocardium, after the contrast has washed out of the blood.

# Tips for choosing the TI

1. **Start with a TI scout (Look-Locker)**  
   Use it to find the TI that nulls normal myocardium, especially for LGE.
   - EGE (within 3 minutes): TI about 600 ms to null the blood pool.
   - LGE (10–20 minutes after injection): set the TI to null myocardium, usually 250–350 ms.
2. **Adjust the TI as time passes after injection**
3. **Consider the patient**
   - Kidney function and contrast clearance change T1.
   - Heart rate and rhythm affect timing and image quality.
4. **Use PSIR to reduce TI sensitivity**  
   PSIR depends less on the exact TI. That gives some leeway, but doesn't replace choosing the TI properly.
5. **Check the images right away**  
   Make sure the myocardium or blood pool is properly nulled. If not, repeat the TI scout or adjust the TI by hand.

# In short

For LGE at 10–20 minutes, set the TI for each patient (usually 250–350 ms) to null normal myocardium so scar stands out. For EGE at 1–3 minutes, a fixed TI around 600 ms nulls the blood pool and shows early perfusion defects, inflammation, and especially acute thrombus and microvascular obstruction. Use the TI scout, and check the nulling before moving on.
