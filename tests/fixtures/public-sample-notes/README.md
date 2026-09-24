# Public sample-note corpus

These fixtures are **public educational medical-transcription samples** from
MTSamples.com (and mirrors), collected 2026-09-24. Each page states the sample
is anonymized, contains no real patient information, and is provided solely
for educational/transcription-training purposes.

They are used as parser + structured de-identifier regression inputs because
they capture documentation formats real clinicians actually use:

- numbered IMPRESSION / ASSESSMENT problem lists with separate RECOMMENDATIONS / PLAN / TREATMENT sections
- combined "ASSESSMENT/PLAN:" and "ASSESSMENT AND PLAN:" prose sections
- "HOSPITAL COURSE PER PROBLEM LIST:" with plans embedded per problem
- prose LABORATORY DATA / STUDIES sections ("His white blood cell count is 8.4 with 79 segs")
- unmarked temperatures in both Fahrenheit (97.4, 99, 100.3) and Celsius (36.1, 36.5)
- pulse ranges ("87 to 106"), O2 sat with device context ("95% on 2 L via nasal cannula", "O2 sat 95% on R.A.")
- prose medication lists ("Listed in the chart and include Coumadin, Lasix, ...")
- DISCHARGE MEDICATIONS numbered lists ("Cipro 250 mg, one tablet p.o. b.i.d. for an additional two days")
- meds inline in prose plans and discharge instructions

Source URLs are recorded in each file's header comment.
