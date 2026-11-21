/**
 * Fictional demo reports. Every name, NIC, phone number, address and ID below is invented.
 * They exist so the full pipeline (render → OCR → redact → extract → simulate) can be shown
 * without anyone's real data.
 */
export interface SampleReport {
  id: string;
  title: string;
  description: string;
  collectedOn: string;
  text: string;
}

const header = (date: string, lab: string) => `LANKA CENTRAL DIAGNOSTICS (PVT) LTD
No. 118, Baseline Road, Colombo 09   |   Tel: 011 269 4400
CLINICAL BIOCHEMISTRY REPORT

Patient Name : Mr. Nimal Kumara Perera
NIC No : 199012345678
Age : 36 Years      Sex : Male
Address : 42/1 Galle Road, Wellawatte, Colombo 06
Mobile : +94 77 123 4567
Hospital ID : MRN-0048213
Referred By : Dr. Anoma Wickramasinghe
Lab No : ${lab}
Collected On : ${date}
`;

export const SAMPLE_REPORTS: SampleReport[] = [
  {
    id: "pancreas-duodenal",
    title: "Pancreas / duodenal panel",
    description: "Raised lipase and amylase, H. pylori positive, low haemoglobin",
    collectedOn: "2026-11-02",
    text:
      header("2026-11-02", "LB-26-77120") +
      `
TEST                         RESULT   FLAG  UNITS     REFERENCE
Serum Lipase                 412      H     U/L       13 - 60
Serum Amylase                298      H     U/L       28 - 100
ALT (SGPT)                   48             U/L       7 - 56
AST (SGOT)                   39             U/L       10 - 40
Alkaline Phosphatase         118            U/L       44 - 147
GGT                          72       H     U/L       8 - 61
Total Bilirubin              1.1            mg/dL     0.1 - 1.2
Fasting Blood Sugar          118      H     mg/dL     70 - 99
Triglycerides                212      H     mg/dL     < 150
Serum Calcium                8.7            mg/dL     8.5 - 10.5
Serum Creatinine             1.0            mg/dL     0.7 - 1.3
Haemoglobin                  12.1     L     g/dL      13.5 - 17.5
WBC                          12.8     H     x10^9/L   4.0 - 11.0
CRP                          38       H     mg/L      < 5
H. pylori stool antigen      POSITIVE

Comments: Please correlate clinically. Contact 011 269 4400 for queries.
Authorised by: Dr. R. Fernando (Consultant Chemical Pathologist)
`,
  },
  {
    id: "pancreas-followup",
    title: "Follow-up, 4 weeks later",
    description: "Same patient after treatment; enzymes settling",
    collectedOn: "2026-11-30",
    text:
      header("2026-11-30", "LB-26-80455") +
      `
TEST                         RESULT   FLAG  UNITS     REFERENCE
Serum Lipase                 96       H     U/L       13 - 60
Serum Amylase                104      H     U/L       28 - 100
ALT (SGPT)                   41             U/L       7 - 56
GGT                          58             U/L       8 - 61
Fasting Blood Sugar          104      H     mg/dL     70 - 99
Triglycerides                168      H     mg/dL     < 150
Haemoglobin                  13.2     L     g/dL      13.5 - 17.5
CRP                          9        H     mg/L      < 5
H. pylori stool antigen      NEGATIVE

Authorised by: Dr. R. Fernando (Consultant Chemical Pathologist)
`,
  },
  {
    id: "cardio-renal",
    title: "Cardio-renal panel",
    description: "Raised troponin and creatinine (shows the red-flag path)",
    collectedOn: "2026-10-14",
    text:
      header("2026-10-14", "LB-26-70031") +
      `
TEST                         RESULT   FLAG  UNITS     REFERENCE
hs Troponin I                62       H     ng/L      < 34
Serum Creatinine             1.8      H     mg/dL     0.7 - 1.3
eGFR                         48       L     mL/min    > 90
Blood Urea                   31       H     mg/dL     7 - 20
Potassium                    5.4      H     mmol/L    3.5 - 5.1
Sodium                       138            mmol/L    135 - 145
Triglycerides                190      H     mg/dL     < 150
`,
  },
];
