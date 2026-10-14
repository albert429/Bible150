# Recorded audio provenance

Source: user-supplied `Arabic_arb_VDV_NT_Drama`, 260 chapter MP3s,
639,284,777 bytes and approximately 22.12 hours. Embedded tags identify
Arabic Van Dyck — Audio Drama, © 1996 Bible Society of Egypt;
℗ 2008 Hosanna / Faith Comes By Hearing. No narrator identity is asserted.
Audio reuse rights are separate from the public-domain Scripture text.

Verse cues were generated offline with TorchAudio 2.8 MMS_FA and uroman 1.3.1.
They are machine alignments, not manually verified timings. Chapter audio hashes
and transcript hashes are checked during assembly. Daily manifests preserve
the plan's passage order and carry a fingerprint of the displayed text.
The committed timings are in `data/audio/alignments/`: one JSON file per chapter
(260), holding machine-made cue times, the source MP3 filename, and its hashes. They
contain no audio.
See [preparation and hosting](../../docs/audio.md).

## Timing review queue

The initial automated review flagged the following eight verses (alignment score
below 0.30). Scores are diagnostic model outputs, not calibrated probabilities.
All are inside passages, so none determines a daily passage cut. Low confidence
may still affect verse highlighting or seeking. Review these alongside passage
starts/ends before public release; an unflagged verse is not proof of accuracy.
Times below refer to the original chapter recordings, in seconds.

| Verse     | Day | Start–end     | Score  |
| --------- | --- | ------------- | ------ |
| LUK 2:14  | 3   | 99.86–108.04  | 0.2549 |
| MRK 1:24  | 9   | 195.84–208.34 | 0.0706 |
| MRK 5:9   | 21  | 56.84–67.20   | 0.2868 |
| LUK 8:28  | 22  | 291.42–303.66 | 0.2526 |
| MRK 11:10 | 48  | 75.62–87.48   | 0.0063 |
| LUK 19:38 | 49  | 339.04–348.66 | 0.2219 |
| ACT 12:22 | 80  | 218.30–224.14 | 0.2675 |
| REV 22:17 | 150 | 180.26–193.82 | 0.0087 |
