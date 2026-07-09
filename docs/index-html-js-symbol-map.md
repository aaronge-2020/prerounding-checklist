# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1264-20549`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 896 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _flushWorkupStudioState | 4527 | Workup Studio & Contribution |
| _loadDeidModel | 1613 | De-identification & Vault |
| $ | 1949 | General/App State |
| $$ | 1950 | General/App State |
| acceptWorkupStudioImport | 7842 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 15083 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 13491 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4181 | Patient Roster / Admission |
| addItemSourceIds | 13514 | General/App State |
| addPatientChecklistItemFromEditor | 9457 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 13499 | General/App State |
| addStudioChoiceRow | 6913 | Workup Studio & Contribution |
| addWorkupStudioItem | 7025 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 6761 | Workup Studio & Contribution |
| admitPatientFromForm | 3870 | Patient Roster / Admission |
| allChecklistEntries | 13426 | Checklist / Complaint CDS / Clinical Intent |
| answeredChecklistCount | 13307 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 12755 | General/App State |
| answerTone | 13317 | General/App State |
| answerToneForOption | 13328 | General/App State |
| answerValueList | 13077 | General/App State |
| answerValueSelected | 13242 | General/App State |
| appendBedsideAuditLog | 13100 | Evidence & Physical Exam |
| appendWorkupGroup | 4495 | Workup Studio & Contribution |
| appendWorkupOption | 4488 | Workup Studio & Contribution |
| applicabilityIssueForModule | 11514 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5017 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 16061 | Checklist / Complaint CDS / Clinical Intent |
| applyDeidResult | 11214 | De-identification & Vault |
| applyInitialRouteState | 20488 | General/App State |
| applyLayoutPreferences | 3238 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 9919 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 16686 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 14824 | General/App State |
| applyServiceFields | 2976 | Service Preferences & Picker |
| applyStreamCameraHints | 17481 | General/App State |
| applyStructuredRefinementText | 16028 | General/App State |
| applyStructuredRefinementToSections | 12439 | General/App State |
| applySupabaseWorkupCatalog | 4972 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 10793 | Evidence & Physical Exam |
| applyVaultPayload | 3164 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3278 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3355 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 6303 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5196 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5208 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 17470 | General/App State |
| approveLatestWorkupStudioChangeSet | 6535 | Workup Studio & Contribution |
| asArray | 11876 | General/App State |
| assertChecklistAnswerState | 13083 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 18056 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 18039 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 2503 | General/App State |
| baseChecklistOptionsForItem | 12775 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1287 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4198 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 19516 | General/App State |
| bindServicePicker | 2867 | Service Preferences & Picker |
| bitsetBytesForIndexes | 18615 | General/App State |
| broadEndorsementQuestion | 13037 | General/App State |
| buildPatientChecklistInWorkspace | 12732 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 17992 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 10629 | General/App State |
| buildWorkupStudioSourcePrompt | 5804 | Workup Studio & Contribution |
| bytesToBase64 | 2497 | General/App State |
| cameraTrackEnhancementConstraints | 17458 | General/App State |
| captureWorkupStudioAuthRedirectError | 5279 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5394 | Supabase & Auth |
| checklistAnswerMetadataForItem | 12810 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 14474 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 18427 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 18440 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 13415 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 8860 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 18421 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 13468 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 13446 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 8869 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 18603 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 18607 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4283 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4276 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 10050 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 18413 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 18611 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 12763 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4265 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 13369 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 13212 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 16374 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 12877 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 14452 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 13335 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 13292 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 13475 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 13356 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 12759 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 13252 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 20419 | General/App State |
| chunkPhoneQrToken | 17025 | QR / Phone Handoff |
| clampLayoutSize | 3223 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 10725 | General/App State |
| cleanEndorsementComponent | 12948 | General/App State |
| cleanPhoneQrUrl | 17343 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 5707 | Workup Studio & Contribution |
| clearActiveChecklistSection | 13839 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 13860 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 8286 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 8298 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 15864 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 9271 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 17380 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 17829 | QR / Phone Handoff |
| clearStalePhonePayload | 16213 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5042 | Workup Studio & Contribution |
| clearVaultAutoLockTimer | 3521 | De-identification & Vault |
| clearWorkupStudioAuthSession | 4845 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 5839 | Workup Studio & Contribution |
| clinicalIntentModifierText | 11433 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 8022 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 11422 | General/App State |
| cloneJson | 4185 | General/App State |
| clonePatient | 2471 | Patient Roster / Admission |
| closeAdmissionOverlay | 3835 | Patient Roster / Admission |
| closeAllServicePickers | 2791 | Service Preferences & Picker |
| closeDischargeConfirmation | 3901 | Notes / H&P / Discharge |
| closePhiOverlay | 19247 | General/App State |
| closePhoneReturnQr | 19018 | QR / Phone Handoff |
| closeQuickDeid | 11389 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 3917 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 2780 | Service Preferences & Picker |
| closeServiceSettings | 3005 | General/App State |
| closestReviewedModules | 7940 | Checklist / Complaint CDS / Clinical Intent |
| closeWorkupStudioEditorDrawer | 7347 | Workup Studio & Contribution |
| coercePatientTabForDevice | 8359 | Patient Roster / Admission |
| collectPhoneQrChunk | 17754 | QR / Phone Handoff |
| collectQrChunk | 17731 | QR / Phone Handoff |
| collectReturnQrChunk | 17760 | QR / Phone Handoff |
| collectStudioChoiceRows | 6933 | Workup Studio & Contribution |
| commitChecklistAnswer | 13155 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 15669 | QR / Phone Handoff |
| compactAnswerComponent | 18452 | General/App State |
| compactAnswerKeyParts | 18408 | General/App State |
| compactAnswerMenuItem | 13238 | General/App State |
| compactChecklistAnswerBitsetPayload | 18634 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 16359 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 18485 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 18545 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 16346 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 17963 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 18666 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 18521 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 18581 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 16391 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 16417 | Checklist / Complaint CDS / Clinical Intent |
| compactFieldId | 8550 | General/App State |
| compactManifestItemPatch | 16566 | General/App State |
| compactManifestSectionPatch | 16543 | General/App State |
| compactMenuViewport | 3318 | General/App State |
| compactPhoneHandoffDeltaPayloadForQr | 16773 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 16749 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 18727 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 18688 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 18706 | QR / Phone Handoff |
| compactReturnAnswerCount | 18830 | General/App State |
| compactReturnNoteCount | 18836 | Notes / H&P / Discharge |
| compactStringFingerprint | 17922 | Generic Utilities |
| compactStringFingerprint64 | 17932 | Generic Utilities |
| compactWorkupStudioPromptLine | 5599 | Workup Studio & Contribution |
| complaintModuleForSelectedIntents | 11462 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 13937 | General/App State |
| componentFromQuestionLabel | 12968 | Lab Timeline |
| componentsFromQuestionLabel | 12985 | Lab Timeline |
| confirmDischargePatient | 3960 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 15881 | QR / Phone Handoff |
| confirmRebuildChecklist | 3951 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 7478 | Workup Studio & Contribution |
| contributionDraftTriggers | 7495 | Workup Studio & Contribution |
| contributionDraftWorkupId | 7489 | Workup Studio & Contribution |
| contributionExamCatalog | 7548 | Workup Studio & Contribution |
| contributionPrompt | 7531 | Workup Studio & Contribution |
| copyContributionPrompt | 7535 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 10175 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 18294 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 17302 | QR / Phone Handoff |
| copyPhoneReturnPayload | 18395 | QR / Phone Handoff |
| copyText | 19252 | General/App State |
| copyTodayRoundsPrompt | 10778 | General/App State |
| countReviewPayloadItems | 6640 | General/App State |
| createNewWorkupFromAI | 7794 | Workup Studio & Contribution |
| createPatientFromAdmission | 3839 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 16297 | QR / Phone Handoff |
| createPhonePayload | 18238 | QR / Phone Handoff |
| createPhoneQrDeepLink | 16992 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 16973 | QR / Phone Handoff |
| createPhoneReturnPayload | 18390 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 18362 | QR / Phone Handoff |
| createPhoneReturnQrText | 18841 | QR / Phone Handoff |
| createVaultFromPassword | 3572 | De-identification & Vault |
| createWorkupStudioSourceDraft | 5809 | Workup Studio & Contribution |
| createZxingQrReader | 17425 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 18060 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 10549 | Continuity |
| currentContributionPromptOptions | 7514 | Workup Studio & Contribution |
| currentOpenEvidencePromptTemplate | 14759 | Evidence & Physical Exam |
| currentPhoneManifestHash | 18035 | QR / Phone Handoff |
| currentPhonePayload | 16228 | QR / Phone Handoff |
| currentPhoneTransferCode | 16189 | QR / Phone Handoff |
| currentRefinementInputText | 16073 | General/App State |
| currentRouteOrWorkspace | 3476 | General/App State |
| currentWorkupStudioPromptText | 6018 | Workup Studio & Contribution |
| decodePhoneBundleInput | 18086 | QR / Phone Handoff |
| decodePhoneQrToken | 16885 | QR / Phone Handoff |
| decodePhoneReturnInput | 19079 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 18785 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 17549 | QR / Phone Handoff |
| decryptVaultPayload | 2550 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 16504 | Workup Studio & Contribution |
| defaultDraftFor | 8425 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 16516 | Workup Studio & Contribution |
| deidentifyDailyInputs | 10569 | De-identification & Vault |
| deidentifyText | 1762 | De-identification & Vault |
| deleteVault | 3799 | De-identification & Vault |
| demoCasePatient | 3656 | Patient Roster / Admission |
| derivedQrChecklistOptions | 16381 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 2514 | De-identification & Vault |
| dischargePatient | 3906 | Patient Roster / Admission |
| downloadFile | 19269 | General/App State |
| duplicateWorkupStudioSectionItem | 6788 | Workup Studio & Contribution |
| editedImportedAnswerValue | 15648 | General/App State |
| effectiveClinicalIntentRegistry | 11442 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4226 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 11942 | General/App State |
| effectiveLocalWorkupModule | 4214 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4242 | General/App State |
| effectiveWorkupStudioModule | 5517 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 5739 | General/App State |
| emptyWorkupStudioBackendState | 4544 | Workup Studio & Contribution |
| encodePhoneQrToken | 16881 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 18758 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 16242 | De-identification & Vault |
| encryptedVaultRecord | 2560 | De-identification & Vault |
| encryptVaultPayload | 2536 | De-identification & Vault |
| endorsementComponentsForItem | 13049 | General/App State |
| endorsementComponentsFromOptions | 13042 | General/App State |
| endorsementEntry | 13179 | General/App State |
| endorsementEntryStatus | 13183 | General/App State |
| endorsementStatusFor | 13189 | General/App State |
| ensureFindingsPhoneHandoffReady | 8369 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 9280 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 11253 | General/App State |
| ensureWorkup | 12008 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 4682 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5298 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 6082 | Workup Studio & Contribution |
| escapeHtml | 14564 | General/App State |
| escapeObjectiveRegex | 8641 | General/App State |
| evaluateUiComplaintCds | 11990 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 11931 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 15850 | General/App State |
| expandCompactAnswerComponent | 18468 | General/App State |
| expandCompactAnswerValueList | 18557 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 18650 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 16367 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 18499 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 18564 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 16353 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 18676 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 18532 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 18591 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 16439 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 16469 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 16814 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 18731 | QR / Phone Handoff |
| expandManifestItemPatch | 16580 | General/App State |
| expandManifestSectionPatch | 16553 | General/App State |
| explicitChecklistArray | 12796 | Checklist / Complaint CDS / Clinical Intent |
| exportBedsideAuditLog | 13122 | Evidence & Physical Exam |
| exportEncryptedVaultBackup | 2579 | De-identification & Vault |
| exportWorkupStudioPatch | 7874 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 9729 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 12348 | General/App State |
| fallbackComplaintResult | 11961 | General/App State |
| fallbackPatient | 2646 | Patient Roster / Admission |
| fillPatientChecklistEditorFromEntry | 9210 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 10577 | General/App State |
| filterCurrentChecklistMap | 18070 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 9437 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 20384 | General/App State |
| findNamedViewRoute | 20413 | General/App State |
| findPatientChecklistPatchEntry | 9910 | Checklist / Complaint CDS / Clinical Intent |
| flushVaultSave | 3198 | De-identification & Vault |
| focusChecklistNote | 13701 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 13708 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 7898 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 7884 | Workup Studio & Contribution |
| formatAnswerValue | 13282 | Generic Utilities |
| formatCompletionSectionTitle | 13952 | Generic Utilities |
| formatRoundsReportAsText | 15087 | Generic Utilities |
| formatStudioOptionList | 6873 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 7656 | Workup Studio & Contribution |
| generateNewWorkupFormatPrompt | 7682 | Workup Studio & Contribution |
| genericObjectiveDataSpec | 8570 | General/App State |
| getOpenEvidencePromptText | 14885 | Evidence & Physical Exam |
| getSourceText | 11159 | General/App State |
| guardWorkupCopyAction | 11797 | Workup Studio & Contribution |
| guidelineItemText | 8856 | General/App State |
| handleClearAllPrompts | 14855 | General/App State |
| handleConfirmPromptClick | 14867 | General/App State |
| handleMissingWorkupAction | 8079 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 17766 | QR / Phone Handoff |
| handleResizeKeydown | 3381 | General/App State |
| handleSavePromptTemplateClick | 14788 | General/App State |
| handleTogglePromptWorkbench | 14849 | General/App State |
| handleVaultUserActivity | 3536 | De-identification & Vault |
| handleWorkupStudioAuthStateChange | 5262 | Workup Studio & Contribution |
| hasChecklistFinding | 13303 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 9073 | General/App State |
| hideNewWorkupDialog | 7473 | Workup Studio & Contribution |
| htmlToTemplate | 14573 | General/App State |
| hydrateIcons | 4151 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5159 | Workup Studio & Contribution |
| iconSvg | 4102 | General/App State |
| importedAnswerSummaryRows | 15625 | General/App State |
| importPhoneFindings | 19215 | QR / Phone Handoff |
| importPhoneFindingsFromText | 19152 | QR / Phone Handoff |
| includedItems | 11952 | General/App State |
| indexesFromBitsetBytes | 18625 | General/App State |
| insertPromptVariable | 14709 | General/App State |
| installLayoutResizers | 3398 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 9425 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4190 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 13008 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4289 | Workup Studio & Contribution |
| isCompactPatientDevice | 8331 | Patient Roster / Admission |
| isDefaultServicePreferences | 2696 | Service Preferences & Picker |
| isDkaObjectiveModule | 8539 | Checklist / Complaint CDS / Clinical Intent |
| isLocallyMirroredHidden | 11467 | General/App State |
| isPhoneWorkflowDevice | 8335 | QR / Phone Handoff |
| isRoundsPasteBackTask | 14439 | General/App State |
| itemFindingText | 13296 | General/App State |
| itemNote | 13288 | Notes / H&P / Discharge |
| itemText | 12087 | General/App State |
| jsQrDecodeFromCanvas | 17536 | QR / Phone Handoff |
| jumpToPatientPanel | 11149 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 18015 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 5851 | Workup Studio & Contribution |
| listLocalDraftWorkups | 1945 | Workup Studio & Contribution |
| loadDemoCase | 3749 | General/App State |
| loadDesktopPhoneBundle | 18133 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 17321 | QR / Phone Handoff |
| loadLayoutPreferences | 3295 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 1925 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 17354 | QR / Phone Handoff |
| loadServicePreferences | 2731 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5094 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 5485 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 4855 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 5814 | Workup Studio & Contribution |
| loadWorkupStudioState | 5332 | Workup Studio & Contribution |
| localQrChunkFromText | 16924 | QR / Phone Handoff |
| localQrChunkText | 16920 | QR / Phone Handoff |
| localQrScannerAvailable | 17421 | Lab Timeline |
| localWorkupChangeSetsForModule | 4206 | Workup Studio & Contribution |
| lockVault | 3769 | De-identification & Vault |
| looksLikePhoneBundleText | 19106 | QR / Phone Handoff |
| manifestItemById | 16618 | General/App State |
| manifestSectionById | 16614 | General/App State |
| manifestSectionMeta | 16521 | General/App State |
| markAllOpenChecklistItemsReviewed | 13886 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 13907 | Checklist / Complaint CDS / Clinical Intent |
| markPatientDerivedArtifactsStale | 11094 | Patient Roster / Admission |
| matchingChecklistOption | 13365 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 5454 | Workup Studio & Contribution |
| minimalContributionContext | 7500 | Workup Studio & Contribution |
| missingObjectiveRows | 8740 | General/App State |
| mobileSectionTabLabel | 13735 | Lab Timeline |
| modifierOptions | 1575 | General/App State |
| moduleApplicabilityAsLimitation | 11628 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 11482 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 11471 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4250 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4512 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4503 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4261 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4475 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4318 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4359 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4375 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4517 | Checklist / Complaint CDS / Clinical Intent |
| moveServicePickerActiveOption | 2844 | Service Preferences & Picker |
| multiSelectChecklistItem | 13217 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 17525 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 17506 | Lab Timeline |
| newWorkupComplaintAndId | 7650 | Workup Studio & Contribution |
| normalizedAnswerComponent | 12883 | General/App State |
| normalizedChecklistSearch | 13438 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 11418 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 13246 | General/App State |
| normalizedPatientChecklistEditOptions | 9369 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4401 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 9686 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 9711 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 9695 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 6106 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 9506 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 2666 | Service Preferences & Picker |
| normalizeState | 3036 | General/App State |
| normalizeSupabaseUrl | 4565 | Supabase & Auth |
| normalizeWorkupStudioEmail | 4704 | Workup Studio & Contribution |
| numericObjectiveValue | 8676 | General/App State |
| objectiveDataContextText | 8767 | General/App State |
| objectiveDataRows | 8715 | General/App State |
| objectiveDataSpec | 8596 | General/App State |
| objectiveExtractedValueForField | 8659 | General/App State |
| objectiveHintForField | 8681 | General/App State |
| objectiveNumber | 9069 | General/App State |
| objectiveRequiredRows | 8736 | General/App State |
| objectiveSearchText | 8615 | Generic Utilities |
| objectiveSourceForField | 8669 | General/App State |
| objectiveStatusLine | 8744 | General/App State |
| objectiveValueById | 9065 | General/App State |
| objectiveValueForField | 8663 | General/App State |
| openAdmissionOverlay | 3822 | Patient Roster / Admission |
| openEvidencePromptFields | 14753 | Evidence & Physical Exam |
| openEvidencePromptVariables | 14489 | Evidence & Physical Exam |
| openFinalFindingsReview | 19055 | General/App State |
| openImportedPhoneAnswerItem | 15681 | QR / Phone Handoff |
| openPhiOverlay | 19237 | General/App State |
| openPhoneChecklistPrimary | 10395 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 19032 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 19065 | QR / Phone Handoff |
| openQuickDeid | 11384 | De-identification & Vault |
| openRebuildChecklistConfirmation | 3921 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 2833 | Service Preferences & Picker |
| openServiceSettings | 2998 | General/App State |
| openVaultFromPassword | 3550 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 9112 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 7923 | Workup Studio & Contribution |
| optionDisplayLabel | 12906 | Lab Timeline |
| optionFromItemValue | 12790 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 13013 | General/App State |
| optionsFromPatchItem | 9846 | General/App State |
| parsedObjectiveValue | 8645 | Generic Utilities |
| parsePatientChecklistEntryValue | 9160 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 9620 | Generic Utilities |
| parseStructuredWorkupRefinement | 12434 | Workup Studio & Contribution |
| parseStudioOptionList | 6861 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 6155 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 18339 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 19219 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 9563 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 2642 | Patient Roster / Admission |
| patientChecklistEditConfig | 9123 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 9175 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 9389 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 9352 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 9156 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 9864 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 9152 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 9557 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 10062 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 9551 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 9546 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 10000 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 9594 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 10093 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 10014 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 9981 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 10070 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 10058 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 10088 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 9525 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 9511 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 9537 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 9747 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 10503 | Continuity |
| patientDraft | 8438 | Patient Roster / Admission |
| patientHasFollowUpContext | 8339 | Patient Roster / Admission |
| patientList | 2637 | Patient Roster / Admission |
| patientMatchesSearch | 10457 | Patient Roster / Admission |
| patientObjectiveRecord | 8602 | Patient Roster / Admission |
| patientPatchItemFields | 9834 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4327 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 8353 | Lab Timeline |
| patientWorkupPanelElement | 9077 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 6093 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 5464 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 18031 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 18010 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 16622 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 10256 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 16982 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 16267 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 16271 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 16329 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 16280 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 16193 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 15700 | QR / Phone Handoff |
| phoneImportSectionKey | 15693 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 16966 | QR / Phone Handoff |
| phonePayloadTransferText | 16236 | QR / Phone Handoff |
| phoneQrChunkFromText | 16939 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 17034 | QR / Phone Handoff |
| phoneQrStatusHint | 17123 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 17116 | QR / Phone Handoff |
| phoneQrSvgForLink | 17108 | QR / Phone Handoff |
| phoneQrTokenFromText | 16904 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 18823 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 18873 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 18899 | QR / Phone Handoff |
| phoneReturnTokenFromText | 18807 | QR / Phone Handoff |
| plainObject | 16185 | General/App State |
| populatePatientWorkupSelect | 8189 | Workup Studio & Contribution |
| populateServiceSelect | 2742 | General/App State |
| populateWorkupStudioSourceMetadataDefaults | 5783 | Workup Studio & Contribution |
| postgrestInFilter | 5063 | Generic Utilities |
| prepareGithubContribution | 7621 | Workup Studio & Contribution |
| preparePhoneHandoff | 19123 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 17492 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3480 | General/App State |
| primeChecklistWorkflow | 20431 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 14660 | General/App State |
| publicCatalogWorkupStatus | 6251 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 4581 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 7727 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 6335 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 6388 | Workup Studio & Contribution |
| qrModeForText | 17062 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 17433 | QR / Phone Handoff |
| qrSvgForSegments | 17066 | QR / Phone Handoff |
| qrSvgForText | 17088 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 17092 | QR / Phone Handoff |
| queryText | 20380 | General/App State |
| randomBase64 | 2508 | General/App State |
| rawModuleById | 4202 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 10488 | Evidence & Physical Exam |
| readLocalDraftWorkups | 1903 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 4962 | Workup Studio & Contribution |
| readServiceFields | 2943 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 3936 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4323 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4296 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 10251 | General/App State |
| refinementSlug | 12344 | General/App State |
| refreshClinicalApplicabilityControls | 11781 | General/App State |
| refreshNewWorkupFormatPromptButton | 7713 | Workup Studio & Contribution |
| refreshStudioChoiceEmptyState | 6897 | Workup Studio & Contribution |
| refreshSupabaseWorkupCatalogForCurrentSession | 5180 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 6453 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 6030 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 9318 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 1938 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 9493 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 6820 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 13962 | Evidence & Physical Exam |
| renderCaseStatus | 16162 | General/App State |
| renderChecklist | 14074 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 13651 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 13761 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 8067 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 11712 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 7558 | Workup Studio & Contribution |
| renderEvidenceReferenceCards | 13550 | Evidence & Physical Exam |
| renderFinalUpdate | 16154 | General/App State |
| renderGenericPasteBackPreview | 15285 | General/App State |
| renderHandoff | 19145 | General/App State |
| renderImportedPhoneAnswerSummary | 15716 | QR / Phone Handoff |
| renderModifierChips | 11809 | General/App State |
| renderObjectiveChips | 8803 | General/App State |
| renderObjectiveDataSurfaces | 9104 | General/App State |
| renderObjectiveEditor | 8820 | General/App State |
| renderObjectiveHeader | 8787 | General/App State |
| renderObjectiveReadOnlySurfaces | 9088 | General/App State |
| renderOverviewPasteBackResults | 15182 | General/App State |
| renderOverviewRoundsReport | 15115 | General/App State |
| renderPatientChecklistEditor | 9230 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 9798 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 10943 | Patient Roster / Admission |
| renderPatientRail | 10949 | Patient Roster / Admission |
| renderPatientRosterToggle | 4061 | Patient Roster / Admission |
| renderPatientTabs | 8407 | Patient Roster / Admission |
| renderPatientWorkspace | 10823 | Patient Roster / Admission |
| renderPatientWorkupResults | 8108 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 10354 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 10291 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 17149 | QR / Phone Handoff |
| renderPhoneQrCode | 17195 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 18906 | QR / Phone Handoff |
| renderPromptVariableBar | 14724 | General/App State |
| renderResidualPhiWarnings | 11196 | General/App State |
| renderRoundsPasteBackPreview | 15243 | General/App State |
| renderSelectedWorkupCard | 8170 | Workup Studio & Contribution |
| renderServicePicker | 2797 | Service Preferences & Picker |
| renderServicePreferenceSummary | 2983 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 15036 | General/App State |
| renderStudioChoiceRows | 6923 | Workup Studio & Contribution |
| renderStudioItemEditor | 7107 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 7305 | Workup Studio & Contribution |
| renderTodayCockpit | 10679 | General/App State |
| renderTodayReviewList | 10655 | General/App State |
| renderUnsupportedClinicalIntentResult | 8035 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 10195 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupOrderResultSurfaces | 9081 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 8899 | Workup Studio & Contribution |
| renderWorkupRows | 12092 | Workup Studio & Contribution |
| renderWorkupRowsInto | 12108 | Workup Studio & Contribution |
| renderWorkupStudio | 7433 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 4601 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 7353 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 7380 | Workup Studio & Contribution |
| renderWorkupStudioList | 6561 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 6668 | Workup Studio & Contribution |
| reorderById | 16674 | General/App State |
| repairOpenEvidencePatchCandidate | 9662 | Evidence & Physical Exam |
| replaceAllLiteral | 14506 | General/App State |
| reportRecoverableError | 3216 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5029 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 14814 | Evidence & Physical Exam |
| resetNoSaveSession | 3623 | Supabase & Auth |
| resetPhoneQrChunkScanner | 17723 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 17727 | QR / Phone Handoff |
| resetVaultAutoLockTimer | 3528 | De-identification & Vault |
| resetWorkflowArtifacts | 3010 | General/App State |
| resetWorkupStudioPromptTemplate | 6022 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 14920 | Evidence & Physical Exam |
| resolvePromptTemplate | 14671 | General/App State |
| resolveUiComplaintModule | 11880 | Checklist / Complaint CDS / Clinical Intent |
| restoreEncryptedVaultBackupFromFile | 2608 | De-identification & Vault |
| restoreState | 3171 | General/App State |
| reviewedSourceContextText | 10453 | General/App State |
| roundsPasteBackSummaryText | 15231 | General/App State |
| routeForNamedView | 20397 | General/App State |
| runQuickDeid | 11393 | De-identification & Vault |
| runWorkspaceContinuityDeid | 11328 | De-identification & Vault |
| runWorkspaceDeid | 11272 | De-identification & Vault |
| sameManifestItem | 16539 | General/App State |
| sameManifestSectionMeta | 16535 | General/App State |
| sameStringArray | 16531 | General/App State |
| sanitizeRefinementItem | 12356 | General/App State |
| sanitizeStructuredWorkupRefinement | 12401 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 14798 | Evidence & Physical Exam |
| saveGenericPasteBackForActivePatient | 15394 | Patient Roster / Admission |
| saveLayoutPreferences | 3230 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 1930 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 1913 | Workup Studio & Contribution |
| savePatientContinuityCase | 10528 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 15358 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 15319 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 9476 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 11142 | Patient Roster / Admission |
| saveServicePreferences | 2712 | Service Preferences & Picker |
| saveState | 3181 | General/App State |
| saveStructuredRefinement | 15999 | General/App State |
| saveTodayUpdate | 10741 | General/App State |
| saveWorkspaceContext | 11100 | General/App State |
| saveWorkspaceContinuity | 11115 | Continuity |
| saveWorkspaceFindings | 11127 | General/App State |
| saveWorkupStudioChangeSet | 6482 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 5998 | Workup Studio & Contribution |
| saveWorkupStudioState | 5378 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5386 | Workup Studio & Contribution |
| scheduleChecklistRender | 14426 | Checklist / Complaint CDS / Clinical Intent |
| schedulePatientWorkupSearch | 8247 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 17386 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 17835 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 8236 | Workup Studio & Contribution |
| scrollChecklistEntry | 13753 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 8324 | Patient Roster / Admission |
| searchFieldParts | 4342 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 11691 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 12391 | General/App State |
| selectClinicalIntent | 11739 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 11490 | General/App State |
| selectedChecklistSourceIds | 13524 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 11450 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 11426 | General/App State |
| selectedKnowledgeModule | 11446 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 9171 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 10417 | Patient Roster / Admission |
| selectedStudioItem | 5581 | Workup Studio & Contribution |
| selectedTask | 14435 | General/App State |
| selectedWorkupApplicabilityIssue | 11611 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 5539 | Workup Studio & Contribution |
| selectPatient | 11053 | Patient Roster / Admission |
| selectPatientWorkupModule | 8256 | Workup Studio & Contribution |
| selectServiceFromPicker | 2856 | General/App State |
| sendWorkupStudioMagicLink | 4730 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 2921 | Service Preferences & Picker |
| servicePickerForPrefix | 2755 | Service Preferences & Picker |
| servicePickerMatches | 2774 | Service Preferences & Picker |
| servicePickerOptions | 2840 | Service Preferences & Picker |
| servicePreferenceContextText | 2685 | Service Preferences & Picker |
| servicePreferenceLabel | 2678 | Lab Timeline |
| serviceProfileById | 2662 | Service Preferences & Picker |
| serviceProfileSearchText | 2765 | Service Preferences & Picker |
| serviceUserContext | 2703 | Service Preferences & Picker |
| setBedsideCompletionState | 14006 | Evidence & Physical Exam |
| setBedsideNoteValue | 10479 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 8311 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 13199 | General/App State |
| setFieldValueIfInactive | 10554 | General/App State |
| setHandoffStatus | 18125 | General/App State |
| setLayoutNavCollapsed | 3339 | Layout & Navigation Chrome |
| setLayoutSize | 3374 | Layout & Navigation Chrome |
| setObjectiveDataValue | 8775 | General/App State |
| setPatientChecklistEditStatus | 9179 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 9791 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4081 | Patient Roster / Admission |
| setPatientTab | 8376 | Patient Roster / Admission |
| setPatientWorkupPane | 4158 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 18113 | QR / Phone Handoff |
| setPhoneQrScannerActive | 17396 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 17376 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 19024 | QR / Phone Handoff |
| setPromptTemplateEditingState | 14768 | General/App State |
| setReturnQrScannerActive | 17845 | QR / Phone Handoff |
| setReturnQrScannerStatus | 17825 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4333 | Workup Studio & Contribution |
| setServiceFields | 2911 | Service Preferences & Picker |
| setSourceMode | 11191 | General/App State |
| setStatus | 3204 | General/App State |
| setTodayWorkflowMode | 10541 | General/App State |
| setupPromptEditorAutocomplete | 19281 | General/App State |
| setVaultStatus | 2490 | De-identification & Vault |
| setWorkupNavOpen | 3349 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3268 | Workup Studio & Contribution |
| setWorkupStudioInspectorOpen | 7913 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3367 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 5719 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 5711 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 18309 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 20521 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 13876 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 19071 | Evidence & Physical Exam |
| showNewWorkupDialog | 7457 | Workup Studio & Contribution |
| showVaultAccess | 3432 | De-identification & Vault |
| showView | 3994 | General/App State |
| signOutWorkupStudioSupabase | 5258 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 11749 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 13018 | General/App State |
| snapshotChecklistResponseArtifacts | 9305 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4479 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5077 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 13543 | General/App State |
| splitChecklistOptions | 12767 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 17959 | General/App State |
| stableJsonValue | 17944 | General/App State |
| stableWorkupStudioItemId | 6180 | Workup Studio & Contribution |
| startFullFrameQrFallback | 17563 | QR / Phone Handoff |
| startManualQrScanner | 17631 | QR / Phone Handoff |
| startPhoneQrScanner | 17784 | QR / Phone Handoff |
| startReturnQrScanner | 17866 | QR / Phone Handoff |
| startRobustQrScanner | 17712 | QR / Phone Handoff |
| startSinglePatientWorkflow | 3649 | Patient Roster / Admission |
| startZxingQrScanner | 17672 | QR / Phone Handoff |
| stopPhoneQrCarousel | 17137 | QR / Phone Handoff |
| stopPhoneQrScanner | 17403 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 17143 | QR / Phone Handoff |
| stopReturnQrScanner | 17852 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 12466 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 9602 | General/App State |
| structuredRefinementSummary | 15017 | General/App State |
| studioChoiceRowElement | 6877 | Workup Studio & Contribution |
| studioDefaultItemType | 6967 | Workup Studio & Contribution |
| studioGeneratedItemId | 6978 | Workup Studio & Contribution |
| studioItemAnswerMode | 6958 | Workup Studio & Contribution |
| studioItemNormalAnswers | 6954 | Workup Studio & Contribution |
| studioItemOptions | 6947 | Workup Studio & Contribution |
| studioNewItemForSection | 6986 | Workup Studio & Contribution |
| studioSectionDefinition | 5562 | Workup Studio & Contribution |
| studioSectionItems | 5570 | Workup Studio & Contribution |
| studioSectionPayload | 5566 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 5587 | Workup Studio & Contribution |
| submitNewWorkupForReview | 7773 | Workup Studio & Contribution |
| supabaseAuthHeaders | 4767 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 5418 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 4894 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5088 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5175 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 4910 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5058 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5071 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 2969 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 11871 | General/App State |
| syncImportedAnswerSummaryRow | 15656 | General/App State |
| syncLayoutForViewport | 3322 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 11758 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 15610 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 15411 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 9185 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 9517 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 10466 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 10597 | General/App State |
| syncWorkupConcernInputs | 10492 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 15063 | Workup Studio & Contribution |
| syncWorkupSelectors | 8213 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 5986 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 5546 | Workup Studio & Contribution |
| taskDescription | 4177 | General/App State |
| taskHasPasteBack | 14444 | General/App State |
| taskIsPlainEvidenceReview | 14448 | Evidence & Physical Exam |
| taskLabel | 4173 | Lab Timeline |
| titleCaseComponent | 12891 | General/App State |
| titleFromId | 1283 | General/App State |
| todayBaselinePatchFromElements | 10588 | General/App State |
| todayDateKey | 10499 | General/App State |
| todayInputsFromElements | 10560 | General/App State |
| todayPromptTaskId | 10625 | General/App State |
| todaySourceContext | 10610 | General/App State |
| todayWorkflowMode | 10533 | General/App State |
| toggleChecklistAnswer | 13258 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4093 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3274 | Workup Studio & Contribution |
| toggleWorkupStudioPanel | 7905 | Workup Studio & Contribution |
| trimCompactQrRow | 16339 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 11906 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 12805 | General/App State |
| uniqueChecklistOptions | 12782 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 9375 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 11927 | General/App State |
| unlockVault | 3540 | De-identification & Vault |
| updateBedsideCaseTitles | 13728 | Evidence & Physical Exam |
| updateChecklistAnswer | 13175 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 14041 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 7038 | General/App State |
| updateOpenEvidenceChangePreview | 15452 | Evidence & Physical Exam |
| updatePatient | 3894 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 8754 | Patient Roster / Admission |
| updateServiceCustomField | 2953 | General/App State |
| updateServiceSettingsPreview | 2990 | General/App State |
| updateWorkupSearchOnly | 8219 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 6240 | Workup Studio & Contribution |
| validateContributionInput | 7593 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 7719 | Workup Studio & Contribution |
| validEncryptedVaultBackup | 2569 | De-identification & Vault |
| validPublicCatalogSnapshot | 4937 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 2481 | De-identification & Vault |
| vaultPayload | 3177 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 6256 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 10474 | Evidence & Physical Exam |
| visibleChecklistEntries | 13487 | Checklist / Complaint CDS / Clinical Intent |
| withTimeout | 1606 | General/App State |
| withZxingFallbackStop | 17620 | General/App State |
| workupCatalogSupabaseRequest | 4821 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 11901 | Workup Studio & Contribution |
| workupExamRows | 8874 | Workup Studio & Contribution |
| workupItemSearchText | 8558 | Workup Studio & Contribution |
| workupItemsForRow | 8852 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3264 | Workup Studio & Contribution |
| workupMatchBadge | 7933 | Workup Studio & Contribution |
| workupPickerGroups | 7975 | Workup Studio & Contribution |
| workupSearchTokens | 4409 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 4700 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 4585 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 4577 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 4589 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 4597 | Workup Studio & Contribution |
| workupStudioCanReview | 4593 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 6038 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 5507 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 6708 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 6188 | Workup Studio & Contribution |
| workupStudioItemSearchText | 6840 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 5511 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 4708 | Workup Studio & Contribution |
| workupStudioModuleMatches | 5525 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 6737 | Workup Studio & Contribution |
| workupStudioNodeRationale | 6068 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 6072 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 6044 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 6057 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 4725 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 5867 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 5663 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 5605 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 5969 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 5615 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 6210 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 5975 | Workup Studio & Contribution |
| workupStudioSectionIcon | 6624 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 5632 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 5863 | Workup Studio & Contribution |
| workupStudioSectionMeta | 6657 | Workup Studio & Contribution |
| workupStudioSectionMetric | 6649 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 6076 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 5763 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 5746 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 5795 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 5731 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 4779 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 4793 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 6724 | Workup Studio & Contribution |
| writePublicWorkupCatalogCache | 4946 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 17417 | Lab Timeline |
| zxingResultText | 17500 | General/App State |
