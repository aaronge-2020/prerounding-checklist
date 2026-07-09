# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1212-20259`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 885 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _flushWorkupStudioState | 4366 | Workup Studio & Contribution |
| _loadDeidModel | 1559 | De-identification & Vault |
| $ | 1890 | General/App State |
| $$ | 1891 | General/App State |
| acceptWorkupStudioImport | 7681 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 14818 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 13255 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4020 | Patient Roster / Admission |
| addItemSourceIds | 13278 | General/App State |
| addPatientChecklistItemFromEditor | 9296 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 13263 | General/App State |
| addStudioChoiceRow | 6752 | Workup Studio & Contribution |
| addWorkupStudioItem | 6864 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 6600 | Workup Studio & Contribution |
| admitPatientFromForm | 3709 | Patient Roster / Admission |
| allChecklistEntries | 13190 | Checklist / Complaint CDS / Clinical Intent |
| answeredChecklistCount | 13071 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 12579 | General/App State |
| answerTone | 13081 | General/App State |
| answerToneForOption | 13092 | General/App State |
| answerValueList | 12901 | General/App State |
| answerValueSelected | 13006 | General/App State |
| appendWorkupGroup | 4334 | Workup Studio & Contribution |
| appendWorkupOption | 4327 | Workup Studio & Contribution |
| applicabilityIssueForModule | 11338 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 4856 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 15796 | Checklist / Complaint CDS / Clinical Intent |
| applyDeidResult | 11047 | De-identification & Vault |
| applyInitialRouteState | 20201 | General/App State |
| applyLayoutPreferences | 3114 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 9758 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 16421 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 14559 | General/App State |
| applyServiceFields | 2839 | Service Preferences & Picker |
| applyStreamCameraHints | 17216 | General/App State |
| applyStructuredRefinementText | 15763 | General/App State |
| applyStructuredRefinementToSections | 12263 | General/App State |
| applySupabaseWorkupCatalog | 4811 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 10632 | Evidence & Physical Exam |
| applyVaultPayload | 3013 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3154 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3231 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 6142 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5035 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5047 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 17205 | General/App State |
| approveLatestWorkupStudioChangeSet | 6374 | Workup Studio & Contribution |
| asArray | 11700 | General/App State |
| assertChecklistAnswerState | 12907 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 17791 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 17774 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 2434 | General/App State |
| baseChecklistOptionsForItem | 12599 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1234 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4037 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 19251 | General/App State |
| bindServicePicker | 2730 | Service Preferences & Picker |
| bitsetBytesForIndexes | 18350 | General/App State |
| broadEndorsementQuestion | 12861 | General/App State |
| buildPatientChecklistInWorkspace | 12556 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 17727 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 10468 | General/App State |
| buildWorkupStudioSourcePrompt | 5643 | Workup Studio & Contribution |
| bytesToBase64 | 2428 | General/App State |
| cameraTrackEnhancementConstraints | 17193 | General/App State |
| captureWorkupStudioAuthRedirectError | 5118 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5233 | Supabase & Auth |
| checklistAnswerMetadataForItem | 12634 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 14209 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 18162 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 18175 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 13179 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 8699 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 18156 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 13232 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 13210 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 8708 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 18338 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 18342 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4122 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4115 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 9889 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 18148 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 18346 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 12587 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4104 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 13133 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 12976 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 16109 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 12701 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 14187 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 13099 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 13056 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 13239 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 13120 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 12583 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 13016 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 20132 | General/App State |
| chunkPhoneQrToken | 16760 | QR / Phone Handoff |
| clampLayoutSize | 3099 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 10564 | General/App State |
| cleanEndorsementComponent | 12772 | General/App State |
| cleanPhoneQrUrl | 17078 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 5546 | Workup Studio & Contribution |
| clearActiveChecklistSection | 13603 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 13621 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 8125 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 8137 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 15599 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 9110 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 17115 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 17564 | QR / Phone Handoff |
| clearStalePhonePayload | 15948 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 4881 | Workup Studio & Contribution |
| clearWorkupStudioAuthSession | 4684 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 5678 | Workup Studio & Contribution |
| clinicalIntentModifierText | 11257 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 7861 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 11246 | General/App State |
| cloneJson | 4024 | General/App State |
| clonePatient | 2402 | Patient Roster / Admission |
| closeAdmissionOverlay | 3674 | Patient Roster / Admission |
| closeAllServicePickers | 2654 | Service Preferences & Picker |
| closeDischargeConfirmation | 3740 | Notes / H&P / Discharge |
| closePhiOverlay | 18982 | General/App State |
| closePhoneReturnQr | 18753 | QR / Phone Handoff |
| closeQuickDeid | 11213 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 3756 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 2643 | Service Preferences & Picker |
| closeServiceSettings | 2868 | General/App State |
| closestReviewedModules | 7779 | Checklist / Complaint CDS / Clinical Intent |
| closeWorkupStudioEditorDrawer | 7186 | Workup Studio & Contribution |
| coercePatientTabForDevice | 8198 | Patient Roster / Admission |
| collectPhoneQrChunk | 17489 | QR / Phone Handoff |
| collectQrChunk | 17466 | QR / Phone Handoff |
| collectReturnQrChunk | 17495 | QR / Phone Handoff |
| collectStudioChoiceRows | 6772 | Workup Studio & Contribution |
| commitChecklistAnswer | 12924 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 15404 | QR / Phone Handoff |
| compactAnswerComponent | 18187 | General/App State |
| compactAnswerKeyParts | 18143 | General/App State |
| compactAnswerMenuItem | 13002 | General/App State |
| compactChecklistAnswerBitsetPayload | 18369 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 16094 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 18220 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 18280 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 16081 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 17698 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 18401 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 18256 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 18316 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 16126 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 16152 | Checklist / Complaint CDS / Clinical Intent |
| compactFieldId | 8389 | General/App State |
| compactManifestItemPatch | 16301 | General/App State |
| compactManifestSectionPatch | 16278 | General/App State |
| compactMenuViewport | 3194 | General/App State |
| compactPhoneHandoffDeltaPayloadForQr | 16508 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 16484 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 18462 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 18423 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 18441 | QR / Phone Handoff |
| compactReturnAnswerCount | 18565 | General/App State |
| compactReturnNoteCount | 18571 | Notes / H&P / Discharge |
| compactStringFingerprint | 17657 | Generic Utilities |
| compactStringFingerprint64 | 17667 | Generic Utilities |
| compactWorkupStudioPromptLine | 5438 | Workup Studio & Contribution |
| complaintModuleForSelectedIntents | 11286 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 13692 | General/App State |
| componentFromQuestionLabel | 12792 | Lab Timeline |
| componentsFromQuestionLabel | 12809 | Lab Timeline |
| confirmDischargePatient | 3799 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 15616 | QR / Phone Handoff |
| confirmRebuildChecklist | 3790 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 7317 | Workup Studio & Contribution |
| contributionDraftTriggers | 7334 | Workup Studio & Contribution |
| contributionDraftWorkupId | 7328 | Workup Studio & Contribution |
| contributionExamCatalog | 7387 | Workup Studio & Contribution |
| contributionPrompt | 7370 | Workup Studio & Contribution |
| copyContributionPrompt | 7374 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 10014 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 18029 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 17037 | QR / Phone Handoff |
| copyPhoneReturnPayload | 18130 | QR / Phone Handoff |
| copyText | 18987 | General/App State |
| copyTodayRoundsPrompt | 10617 | General/App State |
| countReviewPayloadItems | 6479 | General/App State |
| createNewWorkupFromAI | 7633 | Workup Studio & Contribution |
| createPatientFromAdmission | 3678 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 16032 | QR / Phone Handoff |
| createPhonePayload | 17973 | QR / Phone Handoff |
| createPhoneQrDeepLink | 16727 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 16708 | QR / Phone Handoff |
| createPhoneReturnPayload | 18125 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 18097 | QR / Phone Handoff |
| createPhoneReturnQrText | 18576 | QR / Phone Handoff |
| createVaultFromPassword | 3425 | De-identification & Vault |
| createWorkupStudioSourceDraft | 5648 | Workup Studio & Contribution |
| createZxingQrReader | 17160 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 17795 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 10388 | Continuity |
| currentContributionPromptOptions | 7353 | Workup Studio & Contribution |
| currentOpenEvidencePromptTemplate | 14494 | Evidence & Physical Exam |
| currentPhoneManifestHash | 17770 | QR / Phone Handoff |
| currentPhonePayload | 15963 | QR / Phone Handoff |
| currentPhoneTransferCode | 15924 | QR / Phone Handoff |
| currentRefinementInputText | 15808 | General/App State |
| currentRouteOrWorkspace | 3349 | General/App State |
| currentWorkupStudioPromptText | 5857 | Workup Studio & Contribution |
| decodePhoneBundleInput | 17821 | QR / Phone Handoff |
| decodePhoneQrToken | 16620 | QR / Phone Handoff |
| decodePhoneReturnInput | 18814 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 18520 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 17284 | QR / Phone Handoff |
| decryptVaultPayload | 2481 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 16239 | Workup Studio & Contribution |
| defaultDraftFor | 8264 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 16251 | Workup Studio & Contribution |
| deidentifyDailyInputs | 10408 | De-identification & Vault |
| deidentifyText | 1708 | De-identification & Vault |
| deleteVault | 3644 | De-identification & Vault |
| demoCasePatient | 3507 | Patient Roster / Admission |
| derivedQrChecklistOptions | 16116 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 2445 | De-identification & Vault |
| dischargePatient | 3745 | Patient Roster / Admission |
| downloadFile | 19004 | General/App State |
| duplicateWorkupStudioSectionItem | 6627 | Workup Studio & Contribution |
| editedImportedAnswerValue | 15383 | General/App State |
| effectiveClinicalIntentRegistry | 11266 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4065 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 11766 | General/App State |
| effectiveLocalWorkupModule | 4053 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4081 | General/App State |
| effectiveWorkupStudioModule | 5356 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 5578 | General/App State |
| emptyWorkupStudioBackendState | 4383 | Workup Studio & Contribution |
| encodePhoneQrToken | 16616 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 18493 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 15977 | De-identification & Vault |
| encryptedVaultRecord | 2491 | De-identification & Vault |
| encryptVaultPayload | 2467 | De-identification & Vault |
| endorsementComponentsForItem | 12873 | General/App State |
| endorsementComponentsFromOptions | 12866 | General/App State |
| endorsementEntry | 12943 | General/App State |
| endorsementEntryStatus | 12947 | General/App State |
| endorsementStatusFor | 12953 | General/App State |
| ensureFindingsPhoneHandoffReady | 8208 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 9119 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 11080 | General/App State |
| ensureWorkup | 11832 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 4521 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5137 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 5921 | Workup Studio & Contribution |
| escapeHtml | 14299 | General/App State |
| escapeObjectiveRegex | 8480 | General/App State |
| evaluateUiComplaintCds | 11814 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 11755 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 15585 | General/App State |
| expandCompactAnswerComponent | 18203 | General/App State |
| expandCompactAnswerValueList | 18292 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 18385 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 16102 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 18234 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 18299 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 16088 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 18411 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 18267 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 18326 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 16174 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 16204 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 16549 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 18466 | QR / Phone Handoff |
| expandManifestItemPatch | 16315 | General/App State |
| expandManifestSectionPatch | 16288 | General/App State |
| explicitChecklistArray | 12620 | Checklist / Complaint CDS / Clinical Intent |
| exportWorkupStudioPatch | 7713 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 9568 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 12172 | General/App State |
| fallbackComplaintResult | 11785 | General/App State |
| fallbackPatient | 2509 | Patient Roster / Admission |
| fillPatientChecklistEditorFromEntry | 9049 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 10416 | General/App State |
| filterCurrentChecklistMap | 17805 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 9276 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 20097 | General/App State |
| findNamedViewRoute | 20126 | General/App State |
| findPatientChecklistPatchEntry | 9749 | Checklist / Complaint CDS / Clinical Intent |
| flushVaultSave | 3091 | De-identification & Vault |
| focusChecklistNote | 13465 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 13472 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 7737 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 7723 | Workup Studio & Contribution |
| formatAnswerValue | 13046 | Generic Utilities |
| formatCompletionSectionTitle | 13707 | Generic Utilities |
| formatRoundsReportAsText | 14822 | Generic Utilities |
| formatStudioOptionList | 6712 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 7495 | Workup Studio & Contribution |
| generateNewWorkupFormatPrompt | 7521 | Workup Studio & Contribution |
| genericObjectiveDataSpec | 8409 | General/App State |
| getOpenEvidencePromptText | 14620 | Evidence & Physical Exam |
| getSourceText | 11010 | General/App State |
| guardWorkupCopyAction | 11621 | Workup Studio & Contribution |
| guidelineItemText | 8695 | General/App State |
| handleClearAllPrompts | 14590 | General/App State |
| handleConfirmPromptClick | 14602 | General/App State |
| handleMissingWorkupAction | 7918 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 17501 | QR / Phone Handoff |
| handleResizeKeydown | 3257 | General/App State |
| handleSavePromptTemplateClick | 14523 | General/App State |
| handleTogglePromptWorkbench | 14584 | General/App State |
| handleWorkupStudioAuthStateChange | 5101 | Workup Studio & Contribution |
| hasChecklistFinding | 13067 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 8912 | General/App State |
| hideNewWorkupDialog | 7312 | Workup Studio & Contribution |
| htmlToTemplate | 14308 | General/App State |
| hydrateIcons | 3990 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 4998 | Workup Studio & Contribution |
| iconSvg | 3941 | General/App State |
| importedAnswerSummaryRows | 15360 | General/App State |
| importPhoneFindings | 18950 | QR / Phone Handoff |
| importPhoneFindingsFromText | 18887 | QR / Phone Handoff |
| includedItems | 11776 | General/App State |
| indexesFromBitsetBytes | 18360 | General/App State |
| insertPromptVariable | 14444 | General/App State |
| installLayoutResizers | 3274 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 9264 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4029 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 12832 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4128 | Workup Studio & Contribution |
| isCompactPatientDevice | 8170 | Patient Roster / Admission |
| isDefaultServicePreferences | 2559 | Service Preferences & Picker |
| isDkaObjectiveModule | 8378 | Checklist / Complaint CDS / Clinical Intent |
| isLocallyMirroredHidden | 11291 | General/App State |
| isPhoneWorkflowDevice | 8174 | QR / Phone Handoff |
| isRoundsPasteBackTask | 14174 | General/App State |
| itemFindingText | 13060 | General/App State |
| itemNote | 13052 | Notes / H&P / Discharge |
| itemText | 11911 | General/App State |
| jsQrDecodeFromCanvas | 17271 | QR / Phone Handoff |
| jumpToPatientPanel | 11000 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 17750 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 5690 | Workup Studio & Contribution |
| listLocalDraftWorkups | 1886 | Workup Studio & Contribution |
| loadDemoCase | 3600 | General/App State |
| loadDesktopPhoneBundle | 17868 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 17056 | QR / Phone Handoff |
| loadLayoutPreferences | 3171 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 1866 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 17089 | QR / Phone Handoff |
| loadServicePreferences | 2594 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 4933 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 5324 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 4694 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 5653 | Workup Studio & Contribution |
| loadWorkupStudioState | 5171 | Workup Studio & Contribution |
| localQrChunkFromText | 16659 | QR / Phone Handoff |
| localQrChunkText | 16655 | QR / Phone Handoff |
| localQrScannerAvailable | 17156 | Lab Timeline |
| localWorkupChangeSetsForModule | 4045 | Workup Studio & Contribution |
| lockVault | 3620 | De-identification & Vault |
| looksLikePhoneBundleText | 18841 | QR / Phone Handoff |
| manifestItemById | 16353 | General/App State |
| manifestSectionById | 16349 | General/App State |
| manifestSectionMeta | 16256 | General/App State |
| markAllOpenChecklistItemsReviewed | 13644 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 13662 | Checklist / Complaint CDS / Clinical Intent |
| markPatientDerivedArtifactsStale | 10945 | Patient Roster / Admission |
| matchingChecklistOption | 13129 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 5293 | Workup Studio & Contribution |
| minimalContributionContext | 7339 | Workup Studio & Contribution |
| missingObjectiveRows | 8579 | General/App State |
| mobileSectionTabLabel | 13499 | Lab Timeline |
| modifierOptions | 1521 | General/App State |
| moduleApplicabilityAsLimitation | 11452 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 11306 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 11295 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4089 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4351 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4342 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4100 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4314 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4157 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4198 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4214 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4356 | Checklist / Complaint CDS / Clinical Intent |
| moveServicePickerActiveOption | 2707 | Service Preferences & Picker |
| multiSelectChecklistItem | 12981 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 17260 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 17241 | Lab Timeline |
| newWorkupComplaintAndId | 7489 | Workup Studio & Contribution |
| normalizedAnswerComponent | 12707 | General/App State |
| normalizedChecklistSearch | 13202 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 11242 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 13010 | General/App State |
| normalizedPatientChecklistEditOptions | 9208 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4240 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 9525 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 9550 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 9534 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 5945 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 9345 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 2529 | Service Preferences & Picker |
| normalizeState | 2898 | General/App State |
| normalizeSupabaseUrl | 4404 | Supabase & Auth |
| normalizeWorkupStudioEmail | 4543 | Workup Studio & Contribution |
| numericObjectiveValue | 8515 | General/App State |
| objectiveDataContextText | 8606 | General/App State |
| objectiveDataRows | 8554 | General/App State |
| objectiveDataSpec | 8435 | General/App State |
| objectiveExtractedValueForField | 8498 | General/App State |
| objectiveHintForField | 8520 | General/App State |
| objectiveNumber | 8908 | General/App State |
| objectiveRequiredRows | 8575 | General/App State |
| objectiveSearchText | 8454 | Generic Utilities |
| objectiveSourceForField | 8508 | General/App State |
| objectiveStatusLine | 8583 | General/App State |
| objectiveValueById | 8904 | General/App State |
| objectiveValueForField | 8502 | General/App State |
| openAdmissionOverlay | 3661 | Patient Roster / Admission |
| openEvidencePromptFields | 14488 | Evidence & Physical Exam |
| openEvidencePromptVariables | 14224 | Evidence & Physical Exam |
| openFinalFindingsReview | 18790 | General/App State |
| openImportedPhoneAnswerItem | 15416 | QR / Phone Handoff |
| openPhiOverlay | 18972 | General/App State |
| openPhoneChecklistPrimary | 10234 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 18767 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 18800 | QR / Phone Handoff |
| openQuickDeid | 11208 | De-identification & Vault |
| openRebuildChecklistConfirmation | 3760 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 2696 | Service Preferences & Picker |
| openServiceSettings | 2861 | General/App State |
| openVaultFromPassword | 3403 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 8951 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 7762 | Workup Studio & Contribution |
| optionDisplayLabel | 12730 | Lab Timeline |
| optionFromItemValue | 12614 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 12837 | General/App State |
| optionsFromPatchItem | 9685 | General/App State |
| parsedObjectiveValue | 8484 | Generic Utilities |
| parsePatientChecklistEntryValue | 8999 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 9459 | Generic Utilities |
| parseStructuredWorkupRefinement | 12258 | Workup Studio & Contribution |
| parseStudioOptionList | 6700 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 5994 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 18074 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 18954 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 9402 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 2505 | Patient Roster / Admission |
| patientChecklistEditConfig | 8962 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 9014 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 9228 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 9191 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 8995 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 9703 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 8991 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 9396 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 9901 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 9390 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 9385 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 9839 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 9433 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 9932 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 9853 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 9820 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 9909 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 9897 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 9927 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 9364 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 9350 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 9376 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 9586 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 10342 | Continuity |
| patientDraft | 8277 | Patient Roster / Admission |
| patientHasFollowUpContext | 8178 | Patient Roster / Admission |
| patientList | 2500 | Patient Roster / Admission |
| patientMatchesSearch | 10296 | Patient Roster / Admission |
| patientObjectiveRecord | 8441 | Patient Roster / Admission |
| patientPatchItemFields | 9673 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4166 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 8192 | Lab Timeline |
| patientWorkupPanelElement | 8916 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 5932 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 5303 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 17766 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 17745 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 16357 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 10095 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 16717 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 16002 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 16006 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 16064 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 16015 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 15928 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 15435 | QR / Phone Handoff |
| phoneImportSectionKey | 15428 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 16701 | QR / Phone Handoff |
| phonePayloadTransferText | 15971 | QR / Phone Handoff |
| phoneQrChunkFromText | 16674 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 16769 | QR / Phone Handoff |
| phoneQrStatusHint | 16858 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 16851 | QR / Phone Handoff |
| phoneQrSvgForLink | 16843 | QR / Phone Handoff |
| phoneQrTokenFromText | 16639 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 18558 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 18608 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 18634 | QR / Phone Handoff |
| phoneReturnTokenFromText | 18542 | QR / Phone Handoff |
| plainObject | 15920 | General/App State |
| populatePatientWorkupSelect | 8028 | Workup Studio & Contribution |
| populateServiceSelect | 2605 | General/App State |
| populateWorkupStudioSourceMetadataDefaults | 5622 | Workup Studio & Contribution |
| postgrestInFilter | 4902 | Generic Utilities |
| prepareGithubContribution | 7460 | Workup Studio & Contribution |
| preparePhoneHandoff | 18858 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 17227 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3353 | General/App State |
| primeChecklistWorkflow | 20144 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 14395 | General/App State |
| publicCatalogWorkupStatus | 6090 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 4420 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 7566 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 6174 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 6227 | Workup Studio & Contribution |
| qrModeForText | 16797 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 17168 | QR / Phone Handoff |
| qrSvgForSegments | 16801 | QR / Phone Handoff |
| qrSvgForText | 16823 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 16827 | QR / Phone Handoff |
| queryText | 20093 | General/App State |
| randomBase64 | 2439 | General/App State |
| rawModuleById | 4041 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 10327 | Evidence & Physical Exam |
| readLocalDraftWorkups | 1844 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 4801 | Workup Studio & Contribution |
| readServiceFields | 2806 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 3775 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4162 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4135 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 10090 | General/App State |
| refinementSlug | 12168 | General/App State |
| refreshClinicalApplicabilityControls | 11605 | General/App State |
| refreshNewWorkupFormatPromptButton | 7552 | Workup Studio & Contribution |
| refreshStudioChoiceEmptyState | 6736 | Workup Studio & Contribution |
| refreshSupabaseWorkupCatalogForCurrentSession | 5019 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 6292 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 5869 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 9157 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 1879 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 9332 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 6659 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 13717 | Evidence & Physical Exam |
| renderCaseStatus | 15897 | General/App State |
| renderChecklist | 13829 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 13415 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 13525 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 7906 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 11536 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 7397 | Workup Studio & Contribution |
| renderEvidenceReferenceCards | 13314 | Evidence & Physical Exam |
| renderFinalUpdate | 15889 | General/App State |
| renderGenericPasteBackPreview | 15020 | General/App State |
| renderHandoff | 18880 | General/App State |
| renderImportedPhoneAnswerSummary | 15451 | QR / Phone Handoff |
| renderModifierChips | 11633 | General/App State |
| renderObjectiveChips | 8642 | General/App State |
| renderObjectiveDataSurfaces | 8943 | General/App State |
| renderObjectiveEditor | 8659 | General/App State |
| renderObjectiveHeader | 8626 | General/App State |
| renderObjectiveReadOnlySurfaces | 8927 | General/App State |
| renderOverviewPasteBackResults | 14917 | General/App State |
| renderOverviewRoundsReport | 14850 | General/App State |
| renderPatientChecklistEditor | 9069 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 9637 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 10782 | Patient Roster / Admission |
| renderPatientRail | 10788 | Patient Roster / Admission |
| renderPatientRosterToggle | 3900 | Patient Roster / Admission |
| renderPatientTabs | 8246 | Patient Roster / Admission |
| renderPatientWorkspace | 10662 | Patient Roster / Admission |
| renderPatientWorkupResults | 7947 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 10193 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 10130 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 16884 | QR / Phone Handoff |
| renderPhoneQrCode | 16930 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 18641 | QR / Phone Handoff |
| renderPromptVariableBar | 14459 | General/App State |
| renderRoundsPasteBackPreview | 14978 | General/App State |
| renderSelectedWorkupCard | 8009 | Workup Studio & Contribution |
| renderServicePicker | 2660 | Service Preferences & Picker |
| renderServicePreferenceSummary | 2846 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 14771 | General/App State |
| renderStudioChoiceRows | 6762 | Workup Studio & Contribution |
| renderStudioItemEditor | 6946 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 7144 | Workup Studio & Contribution |
| renderTodayCockpit | 10518 | General/App State |
| renderTodayReviewList | 10494 | General/App State |
| renderUnsupportedClinicalIntentResult | 7874 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 10034 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupOrderResultSurfaces | 8920 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 8738 | Workup Studio & Contribution |
| renderWorkupRows | 11916 | Workup Studio & Contribution |
| renderWorkupRowsInto | 11932 | Workup Studio & Contribution |
| renderWorkupStudio | 7272 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 4440 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 7192 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 7219 | Workup Studio & Contribution |
| renderWorkupStudioList | 6400 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 6507 | Workup Studio & Contribution |
| reorderById | 16409 | General/App State |
| repairOpenEvidencePatchCandidate | 9501 | Evidence & Physical Exam |
| replaceAllLiteral | 14241 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 4868 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 14549 | Evidence & Physical Exam |
| resetNoSaveSession | 3475 | Supabase & Auth |
| resetPhoneQrChunkScanner | 17458 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 17462 | QR / Phone Handoff |
| resetWorkflowArtifacts | 2873 | General/App State |
| resetWorkupStudioPromptTemplate | 5861 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 14655 | Evidence & Physical Exam |
| resolvePromptTemplate | 14406 | General/App State |
| resolveUiComplaintModule | 11704 | Checklist / Complaint CDS / Clinical Intent |
| restoreState | 3068 | General/App State |
| reviewedSourceContextText | 10292 | General/App State |
| roundsPasteBackSummaryText | 14966 | General/App State |
| routeForNamedView | 20110 | General/App State |
| runQuickDeid | 11217 | De-identification & Vault |
| runWorkspaceContinuityDeid | 11153 | De-identification & Vault |
| runWorkspaceDeid | 11098 | De-identification & Vault |
| sameManifestItem | 16274 | General/App State |
| sameManifestSectionMeta | 16270 | General/App State |
| sameStringArray | 16266 | General/App State |
| sanitizeRefinementItem | 12180 | General/App State |
| sanitizeStructuredWorkupRefinement | 12225 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 14533 | Evidence & Physical Exam |
| saveGenericPasteBackForActivePatient | 15129 | Patient Roster / Admission |
| saveLayoutPreferences | 3106 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 1871 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 1854 | Workup Studio & Contribution |
| savePatientContinuityCase | 10367 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 15093 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 15054 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 9315 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 10993 | Patient Roster / Admission |
| saveServicePreferences | 2575 | Service Preferences & Picker |
| saveState | 3079 | General/App State |
| saveStructuredRefinement | 15734 | General/App State |
| saveTodayUpdate | 10580 | General/App State |
| saveWorkspaceContext | 10951 | General/App State |
| saveWorkspaceContinuity | 10966 | Continuity |
| saveWorkspaceFindings | 10978 | General/App State |
| saveWorkupStudioChangeSet | 6321 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 5837 | Workup Studio & Contribution |
| saveWorkupStudioState | 5217 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5225 | Workup Studio & Contribution |
| schedulePatientWorkupSearch | 8086 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 17121 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 17570 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 8075 | Workup Studio & Contribution |
| scrollChecklistEntry | 13517 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 8163 | Patient Roster / Admission |
| searchFieldParts | 4181 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 11515 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 12215 | General/App State |
| selectClinicalIntent | 11563 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 11314 | General/App State |
| selectedChecklistSourceIds | 13288 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 11274 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 11250 | General/App State |
| selectedKnowledgeModule | 11270 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 9010 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 10256 | Patient Roster / Admission |
| selectedStudioItem | 5420 | Workup Studio & Contribution |
| selectedTask | 14170 | General/App State |
| selectedWorkupApplicabilityIssue | 11435 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 5378 | Workup Studio & Contribution |
| selectPatient | 10892 | Patient Roster / Admission |
| selectPatientWorkupModule | 8095 | Workup Studio & Contribution |
| selectServiceFromPicker | 2719 | General/App State |
| sendWorkupStudioMagicLink | 4569 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 2784 | Service Preferences & Picker |
| servicePickerForPrefix | 2618 | Service Preferences & Picker |
| servicePickerMatches | 2637 | Service Preferences & Picker |
| servicePickerOptions | 2703 | Service Preferences & Picker |
| servicePreferenceContextText | 2548 | Service Preferences & Picker |
| servicePreferenceLabel | 2541 | Lab Timeline |
| serviceProfileById | 2525 | Service Preferences & Picker |
| serviceProfileSearchText | 2628 | Service Preferences & Picker |
| serviceUserContext | 2566 | Service Preferences & Picker |
| setBedsideCompletionState | 13761 | Evidence & Physical Exam |
| setBedsideNoteValue | 10318 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 8150 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 12963 | General/App State |
| setFieldValueIfInactive | 10393 | General/App State |
| setHandoffStatus | 17860 | General/App State |
| setLayoutNavCollapsed | 3215 | Layout & Navigation Chrome |
| setLayoutSize | 3250 | Layout & Navigation Chrome |
| setObjectiveDataValue | 8614 | General/App State |
| setPatientChecklistEditStatus | 9018 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 9630 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 3920 | Patient Roster / Admission |
| setPatientTab | 8215 | Patient Roster / Admission |
| setPatientWorkupPane | 3997 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 17848 | QR / Phone Handoff |
| setPhoneQrScannerActive | 17131 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 17111 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 18759 | QR / Phone Handoff |
| setPromptTemplateEditingState | 14503 | General/App State |
| setReturnQrScannerActive | 17580 | QR / Phone Handoff |
| setReturnQrScannerStatus | 17560 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4172 | Workup Studio & Contribution |
| setServiceFields | 2774 | Service Preferences & Picker |
| setSourceMode | 11042 | General/App State |
| setStatus | 3095 | General/App State |
| setTodayWorkflowMode | 10380 | General/App State |
| setupPromptEditorAutocomplete | 19016 | General/App State |
| setVaultStatus | 2421 | De-identification & Vault |
| setWorkupNavOpen | 3225 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3144 | Workup Studio & Contribution |
| setWorkupStudioInspectorOpen | 7752 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3243 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 5558 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 5550 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 18044 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 20234 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 13634 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 18806 | Evidence & Physical Exam |
| showNewWorkupDialog | 7296 | Workup Studio & Contribution |
| showVaultAccess | 3308 | De-identification & Vault |
| showView | 3833 | General/App State |
| signOutWorkupStudioSupabase | 5097 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 11573 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 12842 | General/App State |
| snapshotChecklistResponseArtifacts | 9144 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4318 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 4916 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 13307 | General/App State |
| splitChecklistOptions | 12591 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 17694 | General/App State |
| stableJsonValue | 17679 | General/App State |
| stableWorkupStudioItemId | 6019 | Workup Studio & Contribution |
| startFullFrameQrFallback | 17298 | QR / Phone Handoff |
| startManualQrScanner | 17366 | QR / Phone Handoff |
| startPhoneQrScanner | 17519 | QR / Phone Handoff |
| startReturnQrScanner | 17601 | QR / Phone Handoff |
| startRobustQrScanner | 17447 | QR / Phone Handoff |
| startSinglePatientWorkflow | 3500 | Patient Roster / Admission |
| startZxingQrScanner | 17407 | QR / Phone Handoff |
| stopPhoneQrCarousel | 16872 | QR / Phone Handoff |
| stopPhoneQrScanner | 17138 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 16878 | QR / Phone Handoff |
| stopReturnQrScanner | 17587 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 12290 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 9441 | General/App State |
| structuredRefinementSummary | 14752 | General/App State |
| studioChoiceRowElement | 6716 | Workup Studio & Contribution |
| studioDefaultItemType | 6806 | Workup Studio & Contribution |
| studioGeneratedItemId | 6817 | Workup Studio & Contribution |
| studioItemAnswerMode | 6797 | Workup Studio & Contribution |
| studioItemNormalAnswers | 6793 | Workup Studio & Contribution |
| studioItemOptions | 6786 | Workup Studio & Contribution |
| studioNewItemForSection | 6825 | Workup Studio & Contribution |
| studioSectionDefinition | 5401 | Workup Studio & Contribution |
| studioSectionItems | 5409 | Workup Studio & Contribution |
| studioSectionPayload | 5405 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 5426 | Workup Studio & Contribution |
| submitNewWorkupForReview | 7612 | Workup Studio & Contribution |
| supabaseAuthHeaders | 4606 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 5257 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 4733 | Supabase & Auth |
| supabaseSourcesCatalogPath | 4927 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5014 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 4749 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 4897 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 4910 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 2832 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 11695 | General/App State |
| syncImportedAnswerSummaryRow | 15391 | General/App State |
| syncLayoutForViewport | 3198 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 11582 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 15345 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 15146 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 9024 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 9356 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 10305 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 10436 | General/App State |
| syncWorkupConcernInputs | 10331 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 14798 | Workup Studio & Contribution |
| syncWorkupSelectors | 8052 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 5825 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 5385 | Workup Studio & Contribution |
| taskDescription | 4016 | General/App State |
| taskHasPasteBack | 14179 | General/App State |
| taskIsPlainEvidenceReview | 14183 | Evidence & Physical Exam |
| taskLabel | 4012 | Lab Timeline |
| titleCaseComponent | 12715 | General/App State |
| titleFromId | 1230 | General/App State |
| todayBaselinePatchFromElements | 10427 | General/App State |
| todayDateKey | 10338 | General/App State |
| todayInputsFromElements | 10399 | General/App State |
| todayPromptTaskId | 10464 | General/App State |
| todaySourceContext | 10449 | General/App State |
| todayWorkflowMode | 10372 | General/App State |
| toggleChecklistAnswer | 13022 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 3932 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3150 | Workup Studio & Contribution |
| toggleWorkupStudioPanel | 7744 | Workup Studio & Contribution |
| trimCompactQrRow | 16074 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 11730 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 12629 | General/App State |
| uniqueChecklistOptions | 12606 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 9214 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 11751 | General/App State |
| unlockVault | 3394 | De-identification & Vault |
| updateBedsideCaseTitles | 13492 | Evidence & Physical Exam |
| updateChecklistAnswer | 12939 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 13796 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 6877 | General/App State |
| updateOpenEvidenceChangePreview | 15187 | Evidence & Physical Exam |
| updatePatient | 3733 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 8593 | Patient Roster / Admission |
| updateServiceCustomField | 2816 | General/App State |
| updateServiceSettingsPreview | 2853 | General/App State |
| updateWorkupSearchOnly | 8058 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 6079 | Workup Studio & Contribution |
| validateContributionInput | 7432 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 7558 | Workup Studio & Contribution |
| validPublicCatalogSnapshot | 4776 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 2412 | De-identification & Vault |
| vaultPayload | 3074 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 6095 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 10313 | Evidence & Physical Exam |
| visibleChecklistEntries | 13251 | Checklist / Complaint CDS / Clinical Intent |
| withTimeout | 1552 | General/App State |
| withZxingFallbackStop | 17355 | General/App State |
| workupCatalogSupabaseRequest | 4660 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 11725 | Workup Studio & Contribution |
| workupExamRows | 8713 | Workup Studio & Contribution |
| workupItemSearchText | 8397 | Workup Studio & Contribution |
| workupItemsForRow | 8691 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3140 | Workup Studio & Contribution |
| workupMatchBadge | 7772 | Workup Studio & Contribution |
| workupPickerGroups | 7814 | Workup Studio & Contribution |
| workupSearchTokens | 4248 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 4539 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 4424 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 4416 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 4428 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 4436 | Workup Studio & Contribution |
| workupStudioCanReview | 4432 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 5877 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 5346 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 6547 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 6027 | Workup Studio & Contribution |
| workupStudioItemSearchText | 6679 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 5350 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 4547 | Workup Studio & Contribution |
| workupStudioModuleMatches | 5364 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 6576 | Workup Studio & Contribution |
| workupStudioNodeRationale | 5907 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 5911 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 5883 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 5896 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 4564 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 5706 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 5502 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 5444 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 5808 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 5454 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 6049 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 5814 | Workup Studio & Contribution |
| workupStudioSectionIcon | 6463 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 5471 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 5702 | Workup Studio & Contribution |
| workupStudioSectionMeta | 6496 | Workup Studio & Contribution |
| workupStudioSectionMetric | 6488 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 5915 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 5602 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 5585 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 5634 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 5570 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 4618 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 4632 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 6563 | Workup Studio & Contribution |
| writePublicWorkupCatalogCache | 4785 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 17152 | Lab Timeline |
| zxingResultText | 17235 | General/App State |
