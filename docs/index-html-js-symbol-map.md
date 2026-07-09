# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1264-20569`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 897 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _flushWorkupStudioState | 4528 | Workup Studio & Contribution |
| _loadDeidModel | 1613 | De-identification & Vault |
| $ | 1949 | General/App State |
| $$ | 1950 | General/App State |
| acceptWorkupStudioImport | 7843 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 15107 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 13515 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4182 | Patient Roster / Admission |
| addItemSourceIds | 13538 | General/App State |
| addPatientChecklistItemFromEditor | 9458 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 13523 | General/App State |
| addStudioChoiceRow | 6914 | Workup Studio & Contribution |
| addWorkupStudioItem | 7026 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 6762 | Workup Studio & Contribution |
| admitPatientFromForm | 3871 | Patient Roster / Admission |
| allChecklistEntries | 13450 | Checklist / Complaint CDS / Clinical Intent |
| answeredChecklistCount | 13331 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 12779 | General/App State |
| answerTone | 13341 | General/App State |
| answerToneForOption | 13352 | General/App State |
| answerValueList | 13101 | General/App State |
| answerValueSelected | 13266 | General/App State |
| appendBedsideAuditLog | 13124 | Evidence & Physical Exam |
| appendWorkupGroup | 4496 | Workup Studio & Contribution |
| appendWorkupOption | 4489 | Workup Studio & Contribution |
| applicabilityIssueForModule | 11515 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5018 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 16085 | Checklist / Complaint CDS / Clinical Intent |
| applyDeidResult | 11215 | De-identification & Vault |
| applyInitialRouteState | 20508 | General/App State |
| applyLayoutPreferences | 3239 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 9920 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 16710 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 14848 | General/App State |
| applyServiceFields | 2977 | Service Preferences & Picker |
| applyStreamCameraHints | 17505 | General/App State |
| applyStructuredRefinementText | 16052 | General/App State |
| applyStructuredRefinementToSections | 12440 | General/App State |
| applySupabaseWorkupCatalog | 4973 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 10794 | Evidence & Physical Exam |
| applyVaultPayload | 3165 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3279 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3356 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 6304 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5197 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5209 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 17494 | General/App State |
| approveLatestWorkupStudioChangeSet | 6536 | Workup Studio & Contribution |
| asArray | 11877 | General/App State |
| assertChecklistAnswerState | 13107 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 18080 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 18063 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 2504 | General/App State |
| baseChecklistOptionsForItem | 12799 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1287 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4199 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 19537 | General/App State |
| bindServicePicker | 2868 | Service Preferences & Picker |
| bitsetBytesForIndexes | 18639 | General/App State |
| broadEndorsementQuestion | 13061 | General/App State |
| buildPatientChecklistInWorkspace | 12733 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 18016 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 10630 | General/App State |
| buildWorkupStudioSourcePrompt | 5805 | Workup Studio & Contribution |
| bytesToBase64 | 2498 | General/App State |
| cameraTrackEnhancementConstraints | 17482 | General/App State |
| captureWorkupStudioAuthRedirectError | 5280 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5395 | Supabase & Auth |
| checklistAnswerMetadataForItem | 12834 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 14498 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 18451 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 18464 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 13439 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 8861 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 18445 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 13492 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 13470 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 8870 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 18627 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 18631 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4284 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4277 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 10051 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 18437 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 18635 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 12787 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4266 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 13393 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 13236 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 16398 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 12901 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 14476 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 13359 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 13316 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 13499 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 13380 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 12783 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 13276 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 20439 | General/App State |
| chunkPhoneQrToken | 17049 | QR / Phone Handoff |
| clampLayoutSize | 3224 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 10726 | General/App State |
| cleanEndorsementComponent | 12972 | General/App State |
| cleanPhoneQrUrl | 17367 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 5708 | Workup Studio & Contribution |
| clearActiveChecklistSection | 13863 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 13884 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 8287 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 8299 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 15888 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 9272 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 17404 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 17853 | QR / Phone Handoff |
| clearStalePhonePayload | 16237 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5043 | Workup Studio & Contribution |
| clearVaultAutoLockTimer | 3522 | De-identification & Vault |
| clearWorkupStudioAuthSession | 4846 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 5840 | Workup Studio & Contribution |
| clinicalIntentModifierText | 11434 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 8023 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 11423 | General/App State |
| cloneJson | 4186 | General/App State |
| clonePatient | 2472 | Patient Roster / Admission |
| closeAdmissionOverlay | 3836 | Patient Roster / Admission |
| closeAllServicePickers | 2792 | Service Preferences & Picker |
| closeDischargeConfirmation | 3902 | Notes / H&P / Discharge |
| closePhiOverlay | 19268 | General/App State |
| closePhoneReturnQr | 19042 | QR / Phone Handoff |
| closeQuickDeid | 11390 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 3918 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 2781 | Service Preferences & Picker |
| closeServiceSettings | 3006 | General/App State |
| closestReviewedModules | 7941 | Checklist / Complaint CDS / Clinical Intent |
| closeWorkupStudioEditorDrawer | 7348 | Workup Studio & Contribution |
| coercePatientTabForDevice | 8360 | Patient Roster / Admission |
| collectPhoneQrChunk | 17778 | QR / Phone Handoff |
| collectQrChunk | 17755 | QR / Phone Handoff |
| collectReturnQrChunk | 17784 | QR / Phone Handoff |
| collectStudioChoiceRows | 6934 | Workup Studio & Contribution |
| commitChecklistAnswer | 13179 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 15693 | QR / Phone Handoff |
| compactAnswerComponent | 18476 | General/App State |
| compactAnswerKeyParts | 18432 | General/App State |
| compactAnswerMenuItem | 13262 | General/App State |
| compactChecklistAnswerBitsetPayload | 18658 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 16383 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 18509 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 18569 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 16370 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 17987 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 18690 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 18545 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 18605 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 16415 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 16441 | Checklist / Complaint CDS / Clinical Intent |
| compactFieldId | 8551 | General/App State |
| compactManifestItemPatch | 16590 | General/App State |
| compactManifestSectionPatch | 16567 | General/App State |
| compactMenuViewport | 3319 | General/App State |
| compactPhoneHandoffDeltaPayloadForQr | 16797 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 16773 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 18751 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 18712 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 18730 | QR / Phone Handoff |
| compactReturnAnswerCount | 18854 | General/App State |
| compactReturnNoteCount | 18860 | Notes / H&P / Discharge |
| compactStringFingerprint | 17946 | Generic Utilities |
| compactStringFingerprint64 | 17956 | Generic Utilities |
| compactWorkupStudioPromptLine | 5600 | Workup Studio & Contribution |
| complaintModuleForSelectedIntents | 11463 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 13961 | General/App State |
| componentFromQuestionLabel | 12992 | Lab Timeline |
| componentsFromQuestionLabel | 13009 | Lab Timeline |
| confirmDischargePatient | 3961 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 15905 | QR / Phone Handoff |
| confirmRebuildChecklist | 3952 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 7479 | Workup Studio & Contribution |
| contributionDraftTriggers | 7496 | Workup Studio & Contribution |
| contributionDraftWorkupId | 7490 | Workup Studio & Contribution |
| contributionExamCatalog | 7549 | Workup Studio & Contribution |
| contributionPrompt | 7532 | Workup Studio & Contribution |
| copyContributionPrompt | 7536 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 10176 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 18318 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 17326 | QR / Phone Handoff |
| copyPhoneReturnPayload | 18419 | QR / Phone Handoff |
| copyText | 19273 | General/App State |
| copyTodayRoundsPrompt | 10779 | General/App State |
| countReviewPayloadItems | 6641 | General/App State |
| createNewWorkupFromAI | 7795 | Workup Studio & Contribution |
| createPatientFromAdmission | 3840 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 16321 | QR / Phone Handoff |
| createPhonePayload | 18262 | QR / Phone Handoff |
| createPhoneQrDeepLink | 17016 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 16997 | QR / Phone Handoff |
| createPhoneReturnPayload | 18414 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 18386 | QR / Phone Handoff |
| createPhoneReturnQrText | 18865 | QR / Phone Handoff |
| createVaultFromPassword | 3573 | De-identification & Vault |
| createWorkupStudioSourceDraft | 5810 | Workup Studio & Contribution |
| createZxingQrReader | 17449 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 18084 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 10550 | Continuity |
| currentContributionPromptOptions | 7515 | Workup Studio & Contribution |
| currentOpenEvidencePromptTemplate | 14783 | Evidence & Physical Exam |
| currentPhoneManifestHash | 18059 | QR / Phone Handoff |
| currentPhonePayload | 16252 | QR / Phone Handoff |
| currentPhoneTransferCode | 16213 | QR / Phone Handoff |
| currentRefinementInputText | 16097 | General/App State |
| currentRouteOrWorkspace | 3477 | General/App State |
| currentWorkupStudioPromptText | 6019 | Workup Studio & Contribution |
| decodePhoneBundleInput | 18110 | QR / Phone Handoff |
| decodePhoneQrToken | 16909 | QR / Phone Handoff |
| decodePhoneReturnInput | 19103 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 18809 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 17573 | QR / Phone Handoff |
| decryptVaultPayload | 2551 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 16528 | Workup Studio & Contribution |
| defaultDraftFor | 8426 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 16540 | Workup Studio & Contribution |
| deidentifyDailyInputs | 10570 | De-identification & Vault |
| deidentifyText | 1762 | De-identification & Vault |
| deleteVault | 3800 | De-identification & Vault |
| demoCasePatient | 3657 | Patient Roster / Admission |
| derivedQrChecklistOptions | 16405 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 2515 | De-identification & Vault |
| dischargePatient | 3907 | Patient Roster / Admission |
| downloadFile | 19290 | General/App State |
| duplicateWorkupStudioSectionItem | 6789 | Workup Studio & Contribution |
| editedImportedAnswerValue | 15672 | General/App State |
| effectiveClinicalIntentRegistry | 11443 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4227 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 11943 | General/App State |
| effectiveLocalWorkupModule | 4215 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4243 | General/App State |
| effectiveWorkupStudioModule | 5518 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 5740 | General/App State |
| emptyWorkupStudioBackendState | 4545 | Workup Studio & Contribution |
| encodePhoneQrToken | 16905 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 18782 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 16266 | De-identification & Vault |
| encryptedVaultRecord | 2561 | De-identification & Vault |
| encryptVaultPayload | 2537 | De-identification & Vault |
| endorsementComponentsForItem | 13073 | General/App State |
| endorsementComponentsFromOptions | 13066 | General/App State |
| endorsementEntry | 13203 | General/App State |
| endorsementEntryStatus | 13207 | General/App State |
| endorsementStatusFor | 13213 | General/App State |
| ensureFindingsPhoneHandoffReady | 8370 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 9281 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 11254 | General/App State |
| ensureWorkup | 12009 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 4683 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5299 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 6083 | Workup Studio & Contribution |
| escapeHtml | 14588 | General/App State |
| escapeObjectiveRegex | 8642 | General/App State |
| evaluateUiComplaintCds | 11991 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 11932 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 15874 | General/App State |
| expandCompactAnswerComponent | 18492 | General/App State |
| expandCompactAnswerValueList | 18581 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 18674 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 16391 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 18523 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 18588 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 16377 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 18700 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 18556 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 18615 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 16463 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 16493 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 16838 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 18755 | QR / Phone Handoff |
| expandManifestItemPatch | 16604 | General/App State |
| expandManifestSectionPatch | 16577 | General/App State |
| explicitChecklistArray | 12820 | Checklist / Complaint CDS / Clinical Intent |
| exportBedsideAuditLog | 13146 | Evidence & Physical Exam |
| exportEncryptedVaultBackup | 2580 | De-identification & Vault |
| exportWorkupStudioPatch | 7875 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 9730 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 12349 | General/App State |
| fallbackComplaintResult | 11962 | General/App State |
| fallbackPatient | 2647 | Patient Roster / Admission |
| fillPatientChecklistEditorFromEntry | 9211 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 10578 | General/App State |
| filterCurrentChecklistMap | 18094 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 9438 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 20404 | General/App State |
| findNamedViewRoute | 20433 | General/App State |
| findPatientChecklistPatchEntry | 9911 | Checklist / Complaint CDS / Clinical Intent |
| flushVaultSave | 3199 | De-identification & Vault |
| focusChecklistNote | 13725 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 13732 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 7899 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 7885 | Workup Studio & Contribution |
| formatAnswerValue | 13306 | Generic Utilities |
| formatCompletionSectionTitle | 13976 | Generic Utilities |
| formatRoundsReportAsText | 15111 | Generic Utilities |
| formatStudioOptionList | 6874 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 7657 | Workup Studio & Contribution |
| generateNewWorkupFormatPrompt | 7683 | Workup Studio & Contribution |
| genericObjectiveDataSpec | 8571 | General/App State |
| getOpenEvidencePromptText | 14909 | Evidence & Physical Exam |
| getSourceText | 11160 | General/App State |
| guardWorkupCopyAction | 11798 | Workup Studio & Contribution |
| guidelineItemText | 8857 | General/App State |
| handleClearAllPrompts | 14879 | General/App State |
| handleConfirmPromptClick | 14891 | General/App State |
| handleMissingWorkupAction | 8080 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 17790 | QR / Phone Handoff |
| handleResizeKeydown | 3382 | General/App State |
| handleSavePromptTemplateClick | 14812 | General/App State |
| handleTogglePromptWorkbench | 14873 | General/App State |
| handleVaultUserActivity | 3537 | De-identification & Vault |
| handleWorkupStudioAuthStateChange | 5263 | Workup Studio & Contribution |
| hasChecklistFinding | 13327 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 9074 | General/App State |
| hideNewWorkupDialog | 7474 | Workup Studio & Contribution |
| htmlToTemplate | 14597 | General/App State |
| hydrateIcons | 4152 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5160 | Workup Studio & Contribution |
| iconSvg | 4103 | General/App State |
| importedAnswerSummaryRows | 15649 | General/App State |
| importPhoneFindings | 19236 | QR / Phone Handoff |
| importPhoneFindingsFromText | 19173 | QR / Phone Handoff |
| includedItems | 11953 | General/App State |
| indexesFromBitsetBytes | 18649 | General/App State |
| insertPromptVariable | 14733 | General/App State |
| installLayoutResizers | 3399 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 9426 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4191 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 13032 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4290 | Workup Studio & Contribution |
| isCompactPatientDevice | 8332 | Patient Roster / Admission |
| isDefaultServicePreferences | 2697 | Service Preferences & Picker |
| isDkaObjectiveModule | 8540 | Checklist / Complaint CDS / Clinical Intent |
| isLocallyMirroredHidden | 11468 | General/App State |
| isPhoneWorkflowDevice | 8336 | QR / Phone Handoff |
| isRoundsPasteBackTask | 14463 | General/App State |
| itemFindingText | 13320 | General/App State |
| itemNote | 13312 | Notes / H&P / Discharge |
| itemText | 12088 | General/App State |
| jsQrDecodeFromCanvas | 17560 | QR / Phone Handoff |
| jumpToPatientPanel | 11150 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 18039 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 5852 | Workup Studio & Contribution |
| listLocalDraftWorkups | 1945 | Workup Studio & Contribution |
| loadDemoCase | 3750 | General/App State |
| loadDesktopPhoneBundle | 18157 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 17345 | QR / Phone Handoff |
| loadLayoutPreferences | 3296 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 1925 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 17378 | QR / Phone Handoff |
| loadServicePreferences | 2732 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5095 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 5486 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 4856 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 5815 | Workup Studio & Contribution |
| loadWorkupStudioState | 5333 | Workup Studio & Contribution |
| localQrChunkFromText | 16948 | QR / Phone Handoff |
| localQrChunkText | 16944 | QR / Phone Handoff |
| localQrScannerAvailable | 17445 | Lab Timeline |
| localWorkupChangeSetsForModule | 4207 | Workup Studio & Contribution |
| lockVault | 3770 | De-identification & Vault |
| looksLikePhoneBundleText | 19130 | QR / Phone Handoff |
| manifestItemById | 16642 | General/App State |
| manifestSectionById | 16638 | General/App State |
| manifestSectionMeta | 16545 | General/App State |
| markAllOpenChecklistItemsReviewed | 13910 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 13931 | Checklist / Complaint CDS / Clinical Intent |
| markPatientDerivedArtifactsStale | 11095 | Patient Roster / Admission |
| matchingChecklistOption | 13389 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 5455 | Workup Studio & Contribution |
| minimalContributionContext | 7501 | Workup Studio & Contribution |
| missingObjectiveRows | 8741 | General/App State |
| mobileSectionTabLabel | 13759 | Lab Timeline |
| modifierOptions | 1575 | General/App State |
| moduleApplicabilityAsLimitation | 11629 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 11483 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 11472 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4251 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4513 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4504 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4262 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4476 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4319 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4360 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4376 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4518 | Checklist / Complaint CDS / Clinical Intent |
| moveServicePickerActiveOption | 2845 | Service Preferences & Picker |
| multiSelectChecklistItem | 13241 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 17549 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 17530 | Lab Timeline |
| newWorkupComplaintAndId | 7651 | Workup Studio & Contribution |
| normalizedAnswerComponent | 12907 | General/App State |
| normalizedChecklistSearch | 13462 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 11419 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 13270 | General/App State |
| normalizedPatientChecklistEditOptions | 9370 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4402 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 9687 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 9712 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 9696 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 6107 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 9507 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 2667 | Service Preferences & Picker |
| normalizeState | 3037 | General/App State |
| normalizeSupabaseUrl | 4566 | Supabase & Auth |
| normalizeWorkupStudioEmail | 4705 | Workup Studio & Contribution |
| numericObjectiveValue | 8677 | General/App State |
| objectiveDataContextText | 8768 | General/App State |
| objectiveDataRows | 8716 | General/App State |
| objectiveDataSpec | 8597 | General/App State |
| objectiveExtractedValueForField | 8660 | General/App State |
| objectiveHintForField | 8682 | General/App State |
| objectiveNumber | 9070 | General/App State |
| objectiveRequiredRows | 8737 | General/App State |
| objectiveSearchText | 8616 | Generic Utilities |
| objectiveSourceForField | 8670 | General/App State |
| objectiveStatusLine | 8745 | General/App State |
| objectiveValueById | 9066 | General/App State |
| objectiveValueForField | 8664 | General/App State |
| openAdmissionOverlay | 3823 | Patient Roster / Admission |
| openChecklistExperience | 12754 | Checklist / Complaint CDS / Clinical Intent |
| openEvidencePromptFields | 14777 | Evidence & Physical Exam |
| openEvidencePromptVariables | 14513 | Evidence & Physical Exam |
| openFinalFindingsReview | 19079 | General/App State |
| openImportedPhoneAnswerItem | 15705 | QR / Phone Handoff |
| openPhiOverlay | 19258 | General/App State |
| openPhoneChecklistPrimary | 10396 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 19056 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 19089 | QR / Phone Handoff |
| openQuickDeid | 11385 | De-identification & Vault |
| openRebuildChecklistConfirmation | 3922 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 2834 | Service Preferences & Picker |
| openServiceSettings | 2999 | General/App State |
| openVaultFromPassword | 3551 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 9113 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 7924 | Workup Studio & Contribution |
| optionDisplayLabel | 12930 | Lab Timeline |
| optionFromItemValue | 12814 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 13037 | General/App State |
| optionsFromPatchItem | 9847 | General/App State |
| parsedObjectiveValue | 8646 | Generic Utilities |
| parsePatientChecklistEntryValue | 9161 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 9621 | Generic Utilities |
| parseStructuredWorkupRefinement | 12435 | Workup Studio & Contribution |
| parseStudioOptionList | 6862 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 6156 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 18363 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 19240 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 9564 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 2643 | Patient Roster / Admission |
| patientChecklistEditConfig | 9124 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 9176 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 9390 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 9353 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 9157 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 9865 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 9153 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 9558 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 10063 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 9552 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 9547 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 10001 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 9595 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 10094 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 10015 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 9982 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 10071 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 10059 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 10089 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 9526 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 9512 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 9538 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 9748 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 10504 | Continuity |
| patientDraft | 8439 | Patient Roster / Admission |
| patientHasFollowUpContext | 8340 | Patient Roster / Admission |
| patientList | 2638 | Patient Roster / Admission |
| patientMatchesSearch | 10458 | Patient Roster / Admission |
| patientObjectiveRecord | 8603 | Patient Roster / Admission |
| patientPatchItemFields | 9835 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4328 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 8354 | Lab Timeline |
| patientWorkupPanelElement | 9078 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 6094 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 5465 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 18055 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 18034 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 16646 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 10257 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 17006 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 16291 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 16295 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 16353 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 16304 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 16217 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 15724 | QR / Phone Handoff |
| phoneImportSectionKey | 15717 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 16990 | QR / Phone Handoff |
| phonePayloadTransferText | 16260 | QR / Phone Handoff |
| phoneQrChunkFromText | 16963 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 17058 | QR / Phone Handoff |
| phoneQrStatusHint | 17147 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 17140 | QR / Phone Handoff |
| phoneQrSvgForLink | 17132 | QR / Phone Handoff |
| phoneQrTokenFromText | 16928 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 18847 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 18897 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 18923 | QR / Phone Handoff |
| phoneReturnTokenFromText | 18831 | QR / Phone Handoff |
| plainObject | 16209 | General/App State |
| populatePatientWorkupSelect | 8190 | Workup Studio & Contribution |
| populateServiceSelect | 2743 | General/App State |
| populateWorkupStudioSourceMetadataDefaults | 5784 | Workup Studio & Contribution |
| postgrestInFilter | 5064 | Generic Utilities |
| prepareGithubContribution | 7622 | Workup Studio & Contribution |
| preparePhoneHandoff | 19147 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 17516 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3481 | General/App State |
| primeChecklistWorkflow | 20451 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 14684 | General/App State |
| publicCatalogWorkupStatus | 6252 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 4582 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 7728 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 6336 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 6389 | Workup Studio & Contribution |
| qrModeForText | 17086 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 17457 | QR / Phone Handoff |
| qrSvgForSegments | 17090 | QR / Phone Handoff |
| qrSvgForText | 17112 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 17116 | QR / Phone Handoff |
| queryText | 20400 | General/App State |
| randomBase64 | 2509 | General/App State |
| rawModuleById | 4203 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 10489 | Evidence & Physical Exam |
| readLocalDraftWorkups | 1903 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 4963 | Workup Studio & Contribution |
| readServiceFields | 2944 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 3937 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4324 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4297 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 10252 | General/App State |
| refinementSlug | 12345 | General/App State |
| refreshClinicalApplicabilityControls | 11782 | General/App State |
| refreshNewWorkupFormatPromptButton | 7714 | Workup Studio & Contribution |
| refreshStudioChoiceEmptyState | 6898 | Workup Studio & Contribution |
| refreshSupabaseWorkupCatalogForCurrentSession | 5181 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 6454 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 6031 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 9319 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 1938 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 9494 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 6821 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 13986 | Evidence & Physical Exam |
| renderCaseStatus | 16186 | General/App State |
| renderChecklist | 14098 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 13675 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 13785 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 8068 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 11713 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 7559 | Workup Studio & Contribution |
| renderEvidenceReferenceCards | 13574 | Evidence & Physical Exam |
| renderFinalUpdate | 16178 | General/App State |
| renderGenericPasteBackPreview | 15309 | General/App State |
| renderHandoff | 19166 | General/App State |
| renderImportedPhoneAnswerSummary | 15740 | QR / Phone Handoff |
| renderModifierChips | 11810 | General/App State |
| renderObjectiveChips | 8804 | General/App State |
| renderObjectiveDataSurfaces | 9105 | General/App State |
| renderObjectiveEditor | 8821 | General/App State |
| renderObjectiveHeader | 8788 | General/App State |
| renderObjectiveReadOnlySurfaces | 9089 | General/App State |
| renderOverviewPasteBackResults | 15206 | General/App State |
| renderOverviewRoundsReport | 15139 | General/App State |
| renderPatientChecklistEditor | 9231 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 9799 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 10944 | Patient Roster / Admission |
| renderPatientRail | 10950 | Patient Roster / Admission |
| renderPatientRosterToggle | 4062 | Patient Roster / Admission |
| renderPatientTabs | 8408 | Patient Roster / Admission |
| renderPatientWorkspace | 10824 | Patient Roster / Admission |
| renderPatientWorkupResults | 8109 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 10355 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 10292 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 17173 | QR / Phone Handoff |
| renderPhoneQrCode | 17219 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 18930 | QR / Phone Handoff |
| renderPromptVariableBar | 14748 | General/App State |
| renderResidualPhiWarnings | 11197 | General/App State |
| renderRoundsPasteBackPreview | 15267 | General/App State |
| renderSelectedWorkupCard | 8171 | Workup Studio & Contribution |
| renderServicePicker | 2798 | Service Preferences & Picker |
| renderServicePreferenceSummary | 2984 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 15060 | General/App State |
| renderStudioChoiceRows | 6924 | Workup Studio & Contribution |
| renderStudioItemEditor | 7108 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 7306 | Workup Studio & Contribution |
| renderTodayCockpit | 10680 | General/App State |
| renderTodayReviewList | 10656 | General/App State |
| renderUnsupportedClinicalIntentResult | 8036 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 10196 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupOrderResultSurfaces | 9082 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 8900 | Workup Studio & Contribution |
| renderWorkupRows | 12093 | Workup Studio & Contribution |
| renderWorkupRowsInto | 12109 | Workup Studio & Contribution |
| renderWorkupStudio | 7434 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 4602 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 7354 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 7381 | Workup Studio & Contribution |
| renderWorkupStudioList | 6562 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 6669 | Workup Studio & Contribution |
| reorderById | 16698 | General/App State |
| repairOpenEvidencePatchCandidate | 9663 | Evidence & Physical Exam |
| replaceAllLiteral | 14530 | General/App State |
| reportRecoverableError | 3217 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5030 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 14838 | Evidence & Physical Exam |
| resetNoSaveSession | 3624 | Supabase & Auth |
| resetPhoneQrChunkScanner | 17747 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 17751 | QR / Phone Handoff |
| resetVaultAutoLockTimer | 3529 | De-identification & Vault |
| resetWorkflowArtifacts | 3011 | General/App State |
| resetWorkupStudioPromptTemplate | 6023 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 14944 | Evidence & Physical Exam |
| resolvePromptTemplate | 14695 | General/App State |
| resolveUiComplaintModule | 11881 | Checklist / Complaint CDS / Clinical Intent |
| restoreEncryptedVaultBackupFromFile | 2609 | De-identification & Vault |
| restoreState | 3172 | General/App State |
| reviewedSourceContextText | 10454 | General/App State |
| roundsPasteBackSummaryText | 15255 | General/App State |
| routeForNamedView | 20417 | General/App State |
| runQuickDeid | 11394 | De-identification & Vault |
| runWorkspaceContinuityDeid | 11329 | De-identification & Vault |
| runWorkspaceDeid | 11273 | De-identification & Vault |
| sameManifestItem | 16563 | General/App State |
| sameManifestSectionMeta | 16559 | General/App State |
| sameStringArray | 16555 | General/App State |
| sanitizeRefinementItem | 12357 | General/App State |
| sanitizeStructuredWorkupRefinement | 12402 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 14822 | Evidence & Physical Exam |
| saveGenericPasteBackForActivePatient | 15418 | Patient Roster / Admission |
| saveLayoutPreferences | 3231 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 1930 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 1913 | Workup Studio & Contribution |
| savePatientContinuityCase | 10529 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 15382 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 15343 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 9477 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 11143 | Patient Roster / Admission |
| saveServicePreferences | 2713 | Service Preferences & Picker |
| saveState | 3182 | General/App State |
| saveStructuredRefinement | 16023 | General/App State |
| saveTodayUpdate | 10742 | General/App State |
| saveWorkspaceContext | 11101 | General/App State |
| saveWorkspaceContinuity | 11116 | Continuity |
| saveWorkspaceFindings | 11128 | General/App State |
| saveWorkupStudioChangeSet | 6483 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 5999 | Workup Studio & Contribution |
| saveWorkupStudioState | 5379 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5387 | Workup Studio & Contribution |
| scheduleChecklistRender | 14450 | Checklist / Complaint CDS / Clinical Intent |
| schedulePatientWorkupSearch | 8248 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 17410 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 17859 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 8237 | Workup Studio & Contribution |
| scrollChecklistEntry | 13777 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 8325 | Patient Roster / Admission |
| searchFieldParts | 4343 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 11692 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 12392 | General/App State |
| selectClinicalIntent | 11740 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 11491 | General/App State |
| selectedChecklistSourceIds | 13548 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 11451 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 11427 | General/App State |
| selectedKnowledgeModule | 11447 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 9172 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 10418 | Patient Roster / Admission |
| selectedStudioItem | 5582 | Workup Studio & Contribution |
| selectedTask | 14459 | General/App State |
| selectedWorkupApplicabilityIssue | 11612 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 5540 | Workup Studio & Contribution |
| selectPatient | 11054 | Patient Roster / Admission |
| selectPatientWorkupModule | 8257 | Workup Studio & Contribution |
| selectServiceFromPicker | 2857 | General/App State |
| sendWorkupStudioMagicLink | 4731 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 2922 | Service Preferences & Picker |
| servicePickerForPrefix | 2756 | Service Preferences & Picker |
| servicePickerMatches | 2775 | Service Preferences & Picker |
| servicePickerOptions | 2841 | Service Preferences & Picker |
| servicePreferenceContextText | 2686 | Service Preferences & Picker |
| servicePreferenceLabel | 2679 | Lab Timeline |
| serviceProfileById | 2663 | Service Preferences & Picker |
| serviceProfileSearchText | 2766 | Service Preferences & Picker |
| serviceUserContext | 2704 | Service Preferences & Picker |
| setBedsideCompletionState | 14030 | Evidence & Physical Exam |
| setBedsideNoteValue | 10480 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 8312 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 13223 | General/App State |
| setFieldValueIfInactive | 10555 | General/App State |
| setHandoffStatus | 18149 | General/App State |
| setLayoutNavCollapsed | 3340 | Layout & Navigation Chrome |
| setLayoutSize | 3375 | Layout & Navigation Chrome |
| setObjectiveDataValue | 8776 | General/App State |
| setPatientChecklistEditStatus | 9180 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 9792 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4082 | Patient Roster / Admission |
| setPatientTab | 8377 | Patient Roster / Admission |
| setPatientWorkupPane | 4159 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 18137 | QR / Phone Handoff |
| setPhoneQrScannerActive | 17420 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 17400 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 19048 | QR / Phone Handoff |
| setPromptTemplateEditingState | 14792 | General/App State |
| setReturnQrScannerActive | 17869 | QR / Phone Handoff |
| setReturnQrScannerStatus | 17849 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4334 | Workup Studio & Contribution |
| setServiceFields | 2912 | Service Preferences & Picker |
| setSourceMode | 11192 | General/App State |
| setStatus | 3205 | General/App State |
| setTodayWorkflowMode | 10542 | General/App State |
| setupPromptEditorAutocomplete | 19302 | General/App State |
| setVaultStatus | 2491 | De-identification & Vault |
| setWorkupNavOpen | 3350 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3269 | Workup Studio & Contribution |
| setWorkupStudioInspectorOpen | 7914 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3368 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 5720 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 5712 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 18333 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 20541 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 13900 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 19095 | Evidence & Physical Exam |
| showNewWorkupDialog | 7458 | Workup Studio & Contribution |
| showVaultAccess | 3433 | De-identification & Vault |
| showView | 3995 | General/App State |
| signOutWorkupStudioSupabase | 5259 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 11750 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 13042 | General/App State |
| snapshotChecklistResponseArtifacts | 9306 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4480 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5078 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 13567 | General/App State |
| splitChecklistOptions | 12791 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 17983 | General/App State |
| stableJsonValue | 17968 | General/App State |
| stableWorkupStudioItemId | 6181 | Workup Studio & Contribution |
| startFullFrameQrFallback | 17587 | QR / Phone Handoff |
| startManualQrScanner | 17655 | QR / Phone Handoff |
| startPhoneQrScanner | 17808 | QR / Phone Handoff |
| startReturnQrScanner | 17890 | QR / Phone Handoff |
| startRobustQrScanner | 17736 | QR / Phone Handoff |
| startSinglePatientWorkflow | 3650 | Patient Roster / Admission |
| startZxingQrScanner | 17696 | QR / Phone Handoff |
| stopPhoneQrCarousel | 17161 | QR / Phone Handoff |
| stopPhoneQrScanner | 17427 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 17167 | QR / Phone Handoff |
| stopReturnQrScanner | 17876 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 12467 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 9603 | General/App State |
| structuredRefinementSummary | 15041 | General/App State |
| studioChoiceRowElement | 6878 | Workup Studio & Contribution |
| studioDefaultItemType | 6968 | Workup Studio & Contribution |
| studioGeneratedItemId | 6979 | Workup Studio & Contribution |
| studioItemAnswerMode | 6959 | Workup Studio & Contribution |
| studioItemNormalAnswers | 6955 | Workup Studio & Contribution |
| studioItemOptions | 6948 | Workup Studio & Contribution |
| studioNewItemForSection | 6987 | Workup Studio & Contribution |
| studioSectionDefinition | 5563 | Workup Studio & Contribution |
| studioSectionItems | 5571 | Workup Studio & Contribution |
| studioSectionPayload | 5567 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 5588 | Workup Studio & Contribution |
| submitNewWorkupForReview | 7774 | Workup Studio & Contribution |
| supabaseAuthHeaders | 4768 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 5419 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 4895 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5089 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5176 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 4911 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5059 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5072 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 2970 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 11872 | General/App State |
| syncImportedAnswerSummaryRow | 15680 | General/App State |
| syncLayoutForViewport | 3323 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 11759 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 15634 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 15435 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 9186 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 9518 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 10467 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 10598 | General/App State |
| syncWorkupConcernInputs | 10493 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 15087 | Workup Studio & Contribution |
| syncWorkupSelectors | 8214 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 5987 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 5547 | Workup Studio & Contribution |
| taskDescription | 4178 | General/App State |
| taskHasPasteBack | 14468 | General/App State |
| taskIsPlainEvidenceReview | 14472 | Evidence & Physical Exam |
| taskLabel | 4174 | Lab Timeline |
| titleCaseComponent | 12915 | General/App State |
| titleFromId | 1283 | General/App State |
| todayBaselinePatchFromElements | 10589 | General/App State |
| todayDateKey | 10500 | General/App State |
| todayInputsFromElements | 10561 | General/App State |
| todayPromptTaskId | 10626 | General/App State |
| todaySourceContext | 10611 | General/App State |
| todayWorkflowMode | 10534 | General/App State |
| toggleChecklistAnswer | 13282 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4094 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3275 | Workup Studio & Contribution |
| toggleWorkupStudioPanel | 7906 | Workup Studio & Contribution |
| trimCompactQrRow | 16363 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 11907 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 12829 | General/App State |
| uniqueChecklistOptions | 12806 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 9376 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 11928 | General/App State |
| unlockVault | 3541 | De-identification & Vault |
| updateBedsideCaseTitles | 13752 | Evidence & Physical Exam |
| updateChecklistAnswer | 13199 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 14065 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 7039 | General/App State |
| updateOpenEvidenceChangePreview | 15476 | Evidence & Physical Exam |
| updatePatient | 3895 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 8755 | Patient Roster / Admission |
| updateServiceCustomField | 2954 | General/App State |
| updateServiceSettingsPreview | 2991 | General/App State |
| updateWorkupSearchOnly | 8220 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 6241 | Workup Studio & Contribution |
| validateContributionInput | 7594 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 7720 | Workup Studio & Contribution |
| validEncryptedVaultBackup | 2570 | De-identification & Vault |
| validPublicCatalogSnapshot | 4938 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 2482 | De-identification & Vault |
| vaultPayload | 3178 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 6257 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 10475 | Evidence & Physical Exam |
| visibleChecklistEntries | 13511 | Checklist / Complaint CDS / Clinical Intent |
| withTimeout | 1606 | General/App State |
| withZxingFallbackStop | 17644 | General/App State |
| workupCatalogSupabaseRequest | 4822 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 11902 | Workup Studio & Contribution |
| workupExamRows | 8875 | Workup Studio & Contribution |
| workupItemSearchText | 8559 | Workup Studio & Contribution |
| workupItemsForRow | 8853 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3265 | Workup Studio & Contribution |
| workupMatchBadge | 7934 | Workup Studio & Contribution |
| workupPickerGroups | 7976 | Workup Studio & Contribution |
| workupSearchTokens | 4410 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 4701 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 4586 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 4578 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 4590 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 4598 | Workup Studio & Contribution |
| workupStudioCanReview | 4594 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 6039 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 5508 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 6709 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 6189 | Workup Studio & Contribution |
| workupStudioItemSearchText | 6841 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 5512 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 4709 | Workup Studio & Contribution |
| workupStudioModuleMatches | 5526 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 6738 | Workup Studio & Contribution |
| workupStudioNodeRationale | 6069 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 6073 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 6045 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 6058 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 4726 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 5868 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 5664 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 5606 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 5970 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 5616 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 6211 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 5976 | Workup Studio & Contribution |
| workupStudioSectionIcon | 6625 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 5633 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 5864 | Workup Studio & Contribution |
| workupStudioSectionMeta | 6658 | Workup Studio & Contribution |
| workupStudioSectionMetric | 6650 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 6077 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 5764 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 5747 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 5796 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 5732 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 4780 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 4794 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 6725 | Workup Studio & Contribution |
| writePublicWorkupCatalogCache | 4947 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 17441 | Lab Timeline |
| zxingResultText | 17524 | General/App State |
