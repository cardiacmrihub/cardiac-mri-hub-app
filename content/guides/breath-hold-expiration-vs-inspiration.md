---
title: "End-Expiration vs End-Inspiration Breathing Techniques in Cardiac MRI What the Evidence Reveals"
shortTitle: "Breath-holds: end-expiration vs end-inspiration"
summary: "Cardiac MRI depends on carefully controlled breath-holds to freeze motion. The choice between end-inspiration and end-expiration has a measurable impact on motion artifacts, reproducibility and scan quality."
topics: [technique]
published: 2026-04-12
cover: ../images/51892d_cf70bad820124f51ababd978af849a01-mv2.webp
sourceUrl: https://cardiacmrihub.wixsite.com/cardiac-mri-hub/post/end-expiration-vs-end-inspiration-breathing-techniques-in-cardiac-mri-what-the-evidence-reveals
---

Cardiac MRI Breath-Holds: Why End-Expiration (and Modern AI Techniques) Matter Most for Image Quality

Cardiac MRI depends on carefully controlled breath-holds to freeze motion and produce diagnostic images. The choice between end-inspiration and end-expiration has a measurable impact on motion artifacts, reproducibility, and overall scan quality—and newer AI and compressed sensing methods are reshaping how breath-holds are used in practice.[\[ajronline\]](https://ajronline.org/doi/10.2214/AJR.18.20239)

![Illustration of a patient lying on the table of an MRI scanner](../images/51892d_cf70bad820124f51ababd978af849a01-mv2.webp)

# Why Breathing Phase Matters

During cardiac MRI, respiratory motion shifts the diaphragm, chest wall, and heart, degrading endocardial border definition and quantitative measurements. Asking patients to hold their breath reduces this motion, but the specific phase—full inspiration versus relaxed expiration—changes how stable the heart's position remains during acquisition.[\[ajronline\]](https://ajronline.org/doi/10.2214/AJR.18.20239)

- End-inspiration breath-hold is performed with fully inflated lungs and a high, actively contracted diaphragm.
- End-expiration breath-hold follows a comfortable exhalation, with the diaphragm lower and more relaxed.

Because these positions differ mechanically, they lead to different patterns of cardiac motion and artifact burden in cine and T1-weighted imaging.[\[ajronline\]](https://ajronline.org/doi/10.2214/AJR.18.20239)

# Quantitative Advantage of End-Expiration

Multiple comparative studies show that end-expiration breath-holds consistently outperform end-inspiration for motion robustness and diagnostic quality.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

- In T1-weighted liver and thoracoabdominal MRI used as a model for cardiothoracic motion, end-expiration achieved a mean motion score of 3.35 vs 2.80 for end-inspiration (p < 0.00001), with radiologists preferring end-expiration images in 59% of direct comparisons versus 20% for end-inspiration.\[ajronline\]
- Nearly 45% of end-expiration sequences scored 4–5 (minimal or no motion), compared with 23% at end-inspiration, translating clinically into fewer repeat acquisitions and more consistently diagnostic stacks.\[ajronline\]
- In free-breathing real-time cardiac cine reconstructions separated by respiratory phase, end-expiration heartbeats showed higher frame-to-frame similarity, with correlation coefficients around 0.94 vs 0.90 for end-inspiration and expert readers rating image quality same or better at end-expiration in over 80% of cases.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

These findings support end-expiration as the more reproducible and motion-stable phase for cardiac MRI acquisitions.

![Illustration of the lungs, heart and diaphragm, with arrows showing how diaphragm position moves the heart](../images/51892d_5c33ec6ffe7840df9f14308d3d34eee6-mv2.webp)

# Mechanism: Diaphragm, Heart Motion, and Artifacts

The key difference lies in how the diaphragm and respiratory muscles behave during a sustained breath-hold.

- At end-inspiration, the diaphragm and accessory muscles are actively contracted; during the hold they undergo involuntary relaxation ("creep"), causing the diaphragm to drift upward with velocities initially around several mm/sec and cumulative displacements of roughly 1 cm over typical 15–20 second breath-holds.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- Because the pericardium is mechanically linked to the diaphragm, this gradual shift translates into beat-to-beat changes in cardiac position and subtle boundary blur on ECG-gated images.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- At end-expiration, the diaphragm sits in a more relaxed, mechanically stable position, with much slower and more linear motion over time.
- This stability keeps the heart's position more consistent across consecutive cardiac cycles, improving endocardial delineation and reducing respiratory ghosting.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

This physiologic behavior underpins the observed improvements in motion artifact scores and radiologist preference for end-expiration.\[ajronline\]

![Decorative illustration of a brain made of glowing network lines, representing AI](../images/51892d_be9d286dcc9d41b0b3afa656b970c463-mv2.webp)

# Role of AI and Compressed Sensing in Breath-Hold Strategy

Advances in compressed sensing (CS) and AI reconstruction are changing how breath-holds are used, particularly for patients who struggle with traditional 10–15 second holds.

- Compressed sensing cine can significantly shorten breath-holds (often by 40–50%) while preserving ventricular volume and function measurements, making end-expiration holds more achievable for sicker patients[.\[pubmed.ncbi.nlm.nih\]](https://pubmed.ncbi.nlm.nih.gov/33566124/)
- Free-breathing CS cine and perfusion with in-line motion correction allows acquisition throughout the respiratory cycle and sorts or corrects data to end-expiration-like phases, effectively mimicking the stability of a good expiration breath-hold without requiring patient cooperation.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- AI/deep learning reconstructions can denoise and sharpen undersampled or motion-degraded data, improving image quality from very short or imperfect breath-holds and enhancing reproducibility across field strengths and vendors.[\[nature\]](https://www.nature.com/articles/s41598-024-62294-7)

In practice, most modern CS and AI cardiac MRI protocols still favor end-expiration when a breath-hold is required (cine, mapping, perfusion), and use respiratory navigation or phase binning that targets expiration for free-breathing 3D whole-heart and real-time cine[.\[usa.philips\]](https://www.usa.philips.com/healthcare/clinical-article/compressed-sense-clinical-cardiac-mri)

![Illustration of a technologist positioning a patient on the MRI table](../images/51892d_3295744617a24a429f4a5fb1ff534650-mv2.webp)

# Practical Takeaways for Cardiac MRI Practice

For technologists and radiologists, integrating this evidence into daily workflow can improve both efficiency and diagnostic confidence.

- Standardize end-expiration as the default breath-hold phase for routine cines, mapping, and contrast-enhanced sequences. Use clear, simple coaching: "Breathe out normally and hold your breath there"—avoid forcing maximal expiration.\[ajronline\]
- Coach patients to use the same comfortable end-expiration depth for all breath-holds in a stack; avoid alternating inspiration/expiration across slices, which causes slice misregistration.
- Confirm diaphragm position on localizers: at true end-expiration, the diaphragm appears lower (more caudal) on coronal/sagittal scouts compared to inspiration. Consistent positioning = better reproducibility.
- For patients with limited breath-hold capacity (heart failure, dyspnea, arrhythmias), shift toward CS cine, AI-accelerated cine, and free-breathing gated protocols rather than relying on suboptimal inspiration or inconsistent short holds.[\[pmc.ncbi.nlm.nih](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)\]

Focusing on end-expiration breath-holds—supported by modern CS and AI methods where needed—offers a straightforward, evidence-based way to elevate cardiac MRI image quality and reduce motion-related repeat imaging[.\[cardiovascularbusiness\]](https://cardiovascularbusiness.com/topics/cardiac-imaging/exploring-major-breakthroughs-cardiac-imaging)

# Left Ventricular Volume Differences: End-Expiration vs End-Inspiration

Beyond image quality and motion artifacts, the phase of breathing at which cardiac MRI data is acquired has a direct and physiologically important effect on measured left ventricular (LV) volumes. Understanding this relationship is critical for accurate and reproducible quantification of LV end-diastolic volume (EDV), end-systolic volume (ESV), stroke volume (SV), and ejection fraction (EF).

## The Reciprocal Effect of Respiration on LV and RV Volumes

Respiration creates a reciprocal, opposing relationship between right ventricular (RV) and left ventricular (LV) volumes. Real-time cardiac MRI studies demonstrate that during normal inspiration, RV end-diastolic volume increases by approximately 18% while LV volumes decrease — and this relationship reverses during expiration, with LV volumes reaching their maximum at end-expiration. This opposing behavior is driven by ventricular interdependence and changes in intrathoracic pressure throughout the respiratory cycle[.\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

## Quantitative Impact on LV EDV, ESV, and EF

Research using real-time cardiac MRI quantifies the effect clearly. When LV volumes are compared between end-inspiration and end-expiration breath-hold acquisitions:

- LV EDV is significantly higher at end-inspiration compared to end-expiration. Studies report that end-inspiratory LV EDV is approximately 9 mL higher than breath-held or end-expiratory measurements (p = 0.02), meaning inspiration artificially inflates the measured LV cavity size[.\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- LV Ejection Fraction (EF) is lower at end-inspiration than at end-expiration. The end-expiration LV EF was approximately 3.9% higher than end-inspiration values (p < 0.01), a clinically meaningful difference that can affect diagnostic interpretation and risk stratification.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- LV Stroke Volume (SV) is reduced at peak inspiration due to transient pooling of blood in the pulmonary vasculature and reduced LV preload, while LV SV is greatest at end-expiration when venous return to the left heart is maximized.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- LV ESV shows smaller respiratory-phase variation than EDV, with a bias of approximately 0 mL between end-expiration and end-inspiration at rest, meaning the major volume difference is driven primarily by diastolic filling changes.[\[nature](https://www.nature.com/articles/s41598-024-62294-7)\]

## Mechanism: Ventricular Interdependence and Septal Shift

The mechanism behind respiratory-phase LV volume variation is ventricular interdependence within the shared pericardial space. During inspiration, negative intrathoracic pressure increases venous return to the right ventricle, causing RV filling and expansion. This shifts the interventricular septum leftward, compressing the LV cavity and reducing its diastolic filling. During expiration, RV volumes decrease, the septum returns to its normal position, and LV filling is restored — resulting in larger LV EDV and higher LV EF at end-expiration.[\[radiopaedia](https://radiopaedia.org/articles/ventricular-interdependence?lang=us)\]

## Clinical Relevance for Cardiac MRI Quantification

These respiratory-phase volume differences have direct implications for standardization in cardiac MRI reporting and longitudinal follow-up:

- Always acquire all breath-hold sequences in the same respiratory phase — ideally end-expiration — for every study. Mixing breath-hold phases across slices or sequences within the same exam creates slice-to-slice misregistration and introduces systematic volume measurement errors.\[ajronline\]
- When comparing serial studies (e.g., pre- and post-treatment LV function), the same breathing phase must be used consistently. A shift from end-inspiration to end-expiration between exams could introduce a falsely apparent improvement in LV EF of nearly 4%, which exceeds the threshold for clinical significance in some follow-up protocols.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- Normal reference ranges for LV EDV, ESV, and EF in CMR literature are predominantly established from end-expiration breath-hold acquisitions. Comparing end-inspiration acquisitions to these references may lead to overestimation of EDV and underestimation of EF, potentially causing false positive or borderline findings[.\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- For free-breathing or real-time cine protocols, analysis should consistently target end-expiration cardiac cycles. Most modern software and CS reconstruction platforms can retrospectively bin or select end-expiratory cardiac phases to ensure standardized volumetric analysis.[\[pmc.ncbi.nlm.nih\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

In summary, end-expiration is not only the preferred phase for motion artifact reduction — it is also the physiologically correct phase for accurate and reproducible LV volume quantification. EF is highest, and the cardiac position is most stable at end-expiration. Standardizing breath-holds and free-breathing gating to end-expiration ensures that measured LV volumes align with established reference norms and that serial comparisons remain valid over time.

# Key Evidence Summary

| Metric | End-Expiration | End-Inspiration | Statistical Significance |
|---|---|---|---|
| Mean motion score | 3.35 | 2.80 | p < 0.00001 |
| Radiologist preference | 59% | 20% | Statistically significant |
| High-quality sequences (score 4–5) | 45% | 23% | Clinically meaningful​ |
| Frame-to-frame correlation | 0.94 | 0.90 | p ≤ 0.01 ​ |
| Diaphragm drift during breath-hold | ~3 mm, predominantly linear | ~11 mm, variable and larger | 3.7-fold difference​ |

# Bottom Line for Technologists

End-expiration is the preferred breath-hold phase for cardiac MRI because:

1. The diaphragm is relaxed and stable (not actively contracted)
2. The heart stays in a more consistent position beat-to-beat
3. Motion artifacts are significantly reduced
4. Image quality is higher and more reproducible
5. Fewer repeat scans are needed
6. More accurate LV volume quantification

Simple patient script to memorize:

"Take a breath in... now breathe out normally... and hold your breath right there. Stay still and relaxed."

For advanced cases (CS cine with 2–3 beat holds, free-breathing perfusion), the same principle applies: reconstruction algorithms target an expiration-like cardiac position for optimal stability.
