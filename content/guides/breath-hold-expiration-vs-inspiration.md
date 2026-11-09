---
title: "Breath-Holds in Cardiac MRI: End-Expiration vs End-Inspiration"
shortTitle: "Breath-holds: end-expiration vs end-inspiration"
summary: "Why end-expiration is the better breath-hold for cardiac MRI: fewer motion artifacts, more consistent slices and volumes, plus how compressed sensing and AI help patients who can't hold their breath."
topics: [technique]
published: 2026-04-12
cover: ../images/51892d_cf70bad820124f51ababd978af849a01-mv2.webp
sourceUrl: https://cardiacmrihub.wixsite.com/cardiac-mri-hub/post/end-expiration-vs-end-inspiration-breathing-techniques-in-cardiac-mri-what-the-evidence-reveals
---


Cardiac MRI relies on breath-holds to freeze motion. Whether the patient holds at end-inspiration or end-expiration makes a measurable difference to motion artifacts, consistency and image quality. Compressed sensing and AI are also changing how breath-holds are used.

![Illustration of a patient lying on the table of an MRI scanner](../images/51892d_cf70bad820124f51ababd978af849a01-mv2.webp)

# Why the breathing phase matters

Breathing moves the diaphragm, chest wall and heart, which blurs the endocardial border and throws off measurements. A breath-hold stops most of that, but the phase you hold in changes how still the heart stays.

- End-inspiration: lungs full; the diaphragm is contracted and sits low.
- End-expiration: after a normal breath out; the diaphragm is relaxed and sits higher.

The two positions behave differently during the hold, so they produce different amounts of motion and artifact.

# Why end-expiration works better

Two studies, one in liver MRI and one in cardiac real-time cines, both found less motion at end-expiration:

- **T1-weighted liver MRI (not cardiac):** motion scored 3.35 at end-expiration against 2.80 at end-inspiration (p < 0.00001). Radiologists preferred the end-expiration images in 59% of side-by-side comparisons and the end-inspiration images in about 20%. Severe or nondiagnostic motion affected 15% of unenhanced end-expiration sequences against 36% at end-inspiration.[\[Vu 2019\]](https://pubmed.ncbi.nlm.nih.gov/30835515/)
- **Cardiac real-time cines sorted by breathing phase:** heartbeats at end-expiration were more alike from beat to beat (correlation about 0.94 against 0.90), and blinded readers rated the end-expiration heartbeats the same or better in 83% of heart patients' images (86% across everyone studied).[\[Shammi 2023\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

So end-expiration is the steadier phase to hold in.

![Illustration of the lungs, heart and diaphragm, with arrows showing how diaphragm position moves the heart](../images/51892d_5c33ec6ffe7840df9f14308d3d34eee6-mv2.webp)

# Why: the diaphragm and the heart

The difference is in what the diaphragm does during the hold.

- At end-inspiration, the diaphragm and accessory muscles are contracted. During the hold they slowly relax ("creep"), and the diaphragm drifts upward. In one study it moved unpredictably, at 0.1 to 7.9 mm per second.[\[Holland 1998\]](https://pubs.rsna.org/doi/10.1148/radiology.209.2.9807578)
- The pericardium is attached to the diaphragm, so this drift moves the heart. In the same study, the heart didn't return to exactly the same position from beat to beat during the hold, which blurs its borders on gated images.[\[Holland 1998\]](https://pubs.rsna.org/doi/10.1148/radiology.209.2.9807578)
- At end-expiration, the diaphragm drifted slowly and steadily, about 0.15 mm per second.[\[Holland 1998\]](https://pubs.rsna.org/doi/10.1148/radiology.209.2.9807578)
- With less drift, the heart stays closer to the same place from beat to beat, so borders are sharper and there's less breathing ghosting.

This steadier diaphragm is the likely reason end-expiration images score better.

# Compressed sensing and AI

Compressed sensing (CS) and AI reconstruction are changing breath-holds, especially for patients who can't manage 10–15 seconds.

- **Compressed sensing (CS) cines** shorten breath-holds a lot. In one study of 104 patients, a single-breath-hold CS short-axis stack took about 18 seconds of scan time instead of about 2 minutes. EF came out about 1 point lower than standard cines, a difference the authors judged negligible.[\[Wang 2024\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC10856388/)
- **Free-breathing real-time cines** can be sorted by breathing phase after the scan, so the end-expiration heartbeats can be used without the patient holding their breath.[\[Shammi 2023\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)
- **AI (deep learning) reconstruction** can sharpen fast, undersampled real-time cines; in one study, readers preferred it over compressed sensing.[\[Jaubert 2024\]](https://www.nature.com/articles/s41598-024-62294-7)

Vendors' compressed sensing also shortens breath-holds for flow and LGE, which helps patients who tire as the exam goes on.[\[Philips\]](https://www.usa.philips.com/healthcare/clinical-article/compressed-sense-clinical-cardiac-mri) When a breath-hold is still needed, end-expiration is the usual choice, and navigator-gated free-breathing sequences usually accept data at end-expiration.

![Illustration of a technologist positioning a patient on the MRI table](../images/51892d_3295744617a24a429f4a5fb1ff534650-mv2.webp)

# At the scanner

How to put this into practice:

- Make end-expiration the default for cines, maps and contrast sequences. Keep the coaching simple: "Breathe out normally and hold your breath there." Don't push for a maximal breath out.
- Coach the same comfortable breath out for every breath-hold in a stack. Switching between inspiration and expiration across slices causes slices that don't line up.
- Check the diaphragm on the localizers: at end-expiration it sits higher (toward the head) than at inspiration. The same position each time means more consistent images.
- For patients who can't hold their breath (heart failure, COPD, arrhythmia), switch to CS cines or free-breathing sequences rather than poor inspiration holds or inconsistent short holds.[\[Philips\]](https://www.usa.philips.com/healthcare/clinical-article/compressed-sense-clinical-cardiac-mri)

End-expiration breath-holds, with CS and free-breathing options where needed, are a simple way to improve image quality and cut repeats.

# How breathing phase changes LV volumes

The breathing phase also changes the measured left ventricular (LV) volumes and ejection fraction (EF). That matters for consistent measurements from exam to exam.

## LV and RV volumes move in opposite directions

Breathing makes RV and LV volumes move in opposite directions. In a real-time cardiac MRI study of healthy volunteers breathing normally, RV end-diastolic volume rose by about 18% on the breath in while LV volumes fell, and the reverse happened on the breath out. This comes from the ventricles sharing space and from pressure changes in the chest as you breathe.[\[Claessen 2014\]](https://repository.uantwerpen.be/link/irua/137827)

## The effect on EDV and EF

Studies don't fully agree on which way LV end-diastolic volume (EDV) moves, but they agree the breathing phase changes the numbers:

- In a small real-time MRI study of 7 patients, LV EDV was about 9 mL higher (p = 0.02) and EF about 3.9% lower (p < 0.01) at end-inspiration than in a breath-hold.[\[Contijoch 2016\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032536/)
- In the same study, during free breathing, EF was about 3.9% higher at end-expiration than at end-inspiration (p < 0.01), with no significant difference in EDV between the two.[\[Contijoch 2016\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032536/)
- What's consistent: EF reads about 4% lower at end-inspiration. Use the same breathing phase, ideally end-expiration, every time.

## Why: the ventricles share the pericardium

The two ventricles share the pericardial space. On a breath in, lower pressure in the chest draws more blood into the right ventricle, which fills and expands. That pushes the septum to the left, squeezing the LV and reducing its filling. On the breath out, the RV gets smaller, the septum moves back, and the LV fills normally.[\[radiopaedia\]](https://radiopaedia.org/articles/ventricular-interdependence?lang=us)

## What it means for measurements

These differences matter for consistent reporting and follow-up:

- Acquire every breath-hold sequence in the same breathing phase, ideally end-expiration, on every exam. Mixing phases across slices or sequences causes misregistered slices and wrong volumes.
- Use the same breathing phase when comparing exams (for example before and after treatment). Switching from end-inspiration to end-expiration between exams can make LV EF look nearly 4% better when nothing changed.[\[Contijoch 2016\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032536/)
- Normal ranges for LV volumes and EF come from breath-hold cines, usually at end-expiration. Measuring at end-inspiration and comparing with those ranges can make EF look lower than it is.
- For free-breathing or real-time cines, analyze end-expiration heartbeats. Software can sort them out after the scan.[\[Shammi 2023\]](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/)

In short, end-expiration isn't just better for motion: EF reads higher there and the heart is steadiest. Standardizing on it keeps measurements in line with normal ranges and follow-up exams comparable.

# The evidence at a glance

| Measure | End-expiration | End-inspiration | Source |
|---|---|---|---|
| Motion score, T1-weighted liver MRI (1–5, higher is better) | 3.35 | 2.80 (p < 0.00001) | [Vu 2019](https://pubmed.ncbi.nlm.nih.gov/30835515/) |
| Radiologist preference, liver MRI | 59% | About 20% | [Vu 2019](https://pubmed.ncbi.nlm.nih.gov/30835515/) |
| Severe or nondiagnostic motion, liver MRI | 15% | 36% | [Vu 2019](https://pubmed.ncbi.nlm.nih.gov/30835515/) |
| Beat-to-beat correlation, cardiac real-time cine | 0.94 | 0.90 | [Shammi 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC11639450/) |
| Diaphragm drift during the hold | About 0.15 mm/s, steady | 0.1–7.9 mm/s, variable | [Holland 1998](https://pubs.rsna.org/doi/10.1148/radiology.209.2.9807578) |
| LV EF, real-time cine | About 3.9 points higher | Lower | [Contijoch 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5032536/) |

# Bottom line

End-expiration is the better breath-hold for cardiac MRI because:

1. The diaphragm is relaxed and drifts less
2. The heart stays closer to the same place from beat to beat
3. There are fewer motion artifacts
4. Image quality is higher and more consistent
5. Fewer repeats are needed
6. EF reads consistently, in line with normal ranges and earlier exams

A simple script to use:

"Take a breath in... now breathe out normally... and hold your breath right there. Stay still and relaxed."

With short compressed sensing breath-holds and free-breathing sequences, the same idea applies: use end-expiration, or the end-expiration heartbeats.
