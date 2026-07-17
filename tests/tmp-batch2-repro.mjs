/* global console */

import { deidentifyTextStructuredOnly } from "../src/vault/deid.js";

const notes = [
`Patient Name Alice Smith
Date of Birth January 4 1980
Date of Service June 10 2026
Medical Record Number 10485739
Address 742 Evergreen Terrace Springfield Oregon 97477
Phone 541 555 0192
Provider Dr Robert Chang
Chief Complaint Headache
History of Present Illness Alice reports a severe headache. The pain began on June 8 2026. She took acetaminophen. The medicine reduced the pain.
Past Medical History Alice has asthma.
Physical Exam I examined the patient. Her vital signs show normal limits.
Assessment Alice has a tension headache. I prescribed rest.`,
`Patient Name David Brown
Date of Birth February 10 1955
Date of Service September 5 2026
Medical Record Number 58392014
Address 938 Oak Court Miami Florida 33101
Phone 305 555 1048
Provider Dr Michael Wilson
Chief Complaint Back pain
History of Present Illness David presents with lower back pain. He lifted a heavy box yesterday. He feels sharp pain.
Past Medical History David has arthritis.
Physical Exam I palpated the lower back. I noted muscle spasms.
Assessment David has a muscle strain. I prescribed physical therapy.`,
`Patient Name Grace Martinez
Date of Birth May 18 1995
Date of Service December 3 2026
Medical Record Number 18273645
Address 849 Willow Drive Atlanta Georgia 30301
Phone 404 555 8374
Provider Dr Christopher Thomas
Chief Complaint Rash
History of Present Illness Grace shows a red rash on her arm. She hiked in the woods yesterday. The rash itches.
Past Medical History Grace has eczema.
Physical Exam I examined the right arm. I identified contact dermatitis.
Assessment Grace needs a topical cream. I prescribed hydrocortisone.`
];

for (const [i, text] of notes.entries()) {
  const result = deidentifyTextStructuredOnly(text, "2026-07-15");
  console.log(`--- Note ${i + 1} ---`);
  console.log(result.text);
  console.log();
}
