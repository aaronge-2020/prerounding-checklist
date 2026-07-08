# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1327-20354`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 877 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _flushWorkupStudioState | 4510 | Workup Studio & Contribution |
| _loadDeidModel | 1669 | De-identification & Vault |
| $ | 2016 | General/App State |
| $$ | 2017 | General/App State |
| acceptWorkupStudioImport | 7776 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 14915 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 13352 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4164 | Patient Roster / Admission |
| addItemSourceIds | 13375 | General/App State |
| addPatientChecklistItemFromEditor | 9395 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 13360 | General/App State |
| addWorkupStudioItem | 6950 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 6744 | Workup Studio & Contribution |
| admitPatientFromForm | 3853 | Patient Roster / Admission |
| allChecklistEntries | 13287 | Checklist / Complaint CDS / Clinical Intent |
| answeredChecklistCount | 13168 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 12676 | General/App State |
| answerTone | 13178 | General/App State |
| answerToneForOption | 13189 | General/App State |
| answerValueList | 12998 | General/App State |
| answerValueSelected | 13103 | General/App State |
| appendWorkupGroup | 4478 | Workup Studio & Contribution |
| appendWorkupOption | 4471 | Workup Studio & Contribution |
| applicabilityIssueForModule | 11435 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5000 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 15893 | Checklist / Complaint CDS / Clinical Intent |
| applyDeidResult | 11144 | De-identification & Vault |
| applyInitialRouteState | 20296 | General/App State |
| applyLayoutPreferences | 3258 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 9857 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 16518 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 14656 | General/App State |
| applyServiceFields | 2983 | Service Preferences & Picker |
| applyStreamCameraHints | 17313 | General/App State |
| applyStructuredRefinementText | 15860 | General/App State |
| applyStructuredRefinementToSections | 12360 | General/App State |
| applySupabaseWorkupCatalog | 4955 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 10731 | Evidence & Physical Exam |
| applyVaultPayload | 3157 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3298 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3375 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 6286 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5179 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5191 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 17302 | General/App State |
| approveLatestWorkupStudioChangeSet | 6518 | Workup Studio & Contribution |
| asArray | 11797 | General/App State |
| assertChecklistAnswerState | 13004 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 17888 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 17871 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 2578 | General/App State |
| baseChecklistOptionsForItem | 12696 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1348 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4181 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 19348 | General/App State |
| bindServicePicker | 2874 | Service Preferences & Picker |
| bitsetBytesForIndexes | 18447 | General/App State |
| broadEndorsementQuestion | 12958 | General/App State |
| buildPatientChecklistInWorkspace | 12653 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 17824 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 10567 | General/App State |
| buildWorkupStudioSourcePrompt | 5787 | Workup Studio & Contribution |
| bytesToBase64 | 2572 | General/App State |
| cameraTrackEnhancementConstraints | 17290 | General/App State |
| captureWorkupStudioAuthRedirectError | 5262 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5377 | Supabase & Auth |
| checklistAnswerMetadataForItem | 12731 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 14306 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 18259 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 18272 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 13276 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 8794 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 18253 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 13329 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 13307 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 8803 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 18435 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 18439 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4266 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4259 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 9988 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 18245 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 18443 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 12684 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4248 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 13230 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 13073 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 16206 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 12798 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 14284 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 13196 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 13153 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 13336 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 13217 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 12680 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 13113 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 20227 | General/App State |
| chunkPhoneQrToken | 16857 | QR / Phone Handoff |
| clampLayoutSize | 3243 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 10663 | General/App State |
| cleanEndorsementComponent | 12869 | General/App State |
| cleanPhoneQrUrl | 17175 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 5690 | Workup Studio & Contribution |
| clearActiveChecklistSection | 13700 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 13718 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 8220 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 8232 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 15696 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 9209 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 17212 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 17661 | QR / Phone Handoff |
| clearStalePhonePayload | 16045 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5025 | Workup Studio & Contribution |
| clearWorkupStudioAuthSession | 4828 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 5822 | Workup Studio & Contribution |
| clinicalIntentModifierText | 11354 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 7956 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 11343 | General/App State |
| cloneJson | 4168 | General/App State |
| clonePatient | 2546 | Patient Roster / Admission |
| closeAdmissionOverlay | 3818 | Patient Roster / Admission |
| closeAllServicePickers | 2798 | Service Preferences & Picker |
| closeDischargeConfirmation | 3884 | Notes / H&P / Discharge |
| closePhiOverlay | 19079 | General/App State |
| closePhoneReturnQr | 18850 | QR / Phone Handoff |
| closeQuickDeid | 11310 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 3900 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 2787 | Service Preferences & Picker |
| closeServiceSettings | 3012 | General/App State |
| closestReviewedModules | 7874 | Checklist / Complaint CDS / Clinical Intent |
| closeWorkupStudioEditorDrawer | 7319 | Workup Studio & Contribution |
| coercePatientTabForDevice | 8293 | Patient Roster / Admission |
| collectPhoneQrChunk | 17586 | QR / Phone Handoff |
| collectQrChunk | 17563 | QR / Phone Handoff |
| collectReturnQrChunk | 17592 | QR / Phone Handoff |
| commitChecklistAnswer | 13021 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 15501 | QR / Phone Handoff |
| compactAnswerComponent | 18284 | General/App State |
| compactAnswerKeyParts | 18240 | General/App State |
| compactAnswerMenuItem | 13099 | General/App State |
| compactChecklistAnswerBitsetPayload | 18466 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 16191 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 18317 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 18377 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 16178 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 17795 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 18498 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 18353 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 18413 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 16223 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 16249 | Checklist / Complaint CDS / Clinical Intent |
| compactFieldId | 8484 | General/App State |
| compactManifestItemPatch | 16398 | General/App State |
| compactManifestSectionPatch | 16375 | General/App State |
| compactMenuViewport | 3338 | General/App State |
| compactPhoneHandoffDeltaPayloadForQr | 16605 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 16581 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 18559 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 18520 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 18538 | QR / Phone Handoff |
| compactReturnAnswerCount | 18662 | General/App State |
| compactReturnNoteCount | 18668 | Notes / H&P / Discharge |
| compactStringFingerprint | 17754 | Generic Utilities |
| compactStringFingerprint64 | 17764 | Generic Utilities |
| compactWorkupStudioPromptLine | 5582 | Workup Studio & Contribution |
| complaintModuleForSelectedIntents | 11383 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 13789 | General/App State |
| componentFromQuestionLabel | 12889 | Lab Timeline |
| componentsFromQuestionLabel | 12906 | Lab Timeline |
| confirmDischargePatient | 3943 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 15713 | QR / Phone Handoff |
| confirmRebuildChecklist | 3934 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 7447 | Workup Studio & Contribution |
| contributionDraftTriggers | 7464 | Workup Studio & Contribution |
| contributionDraftWorkupId | 7458 | Workup Studio & Contribution |
| contributionExamCatalog | 7517 | Workup Studio & Contribution |
| contributionPrompt | 7500 | Workup Studio & Contribution |
| copyContributionPrompt | 7504 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 10113 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 18126 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 17134 | QR / Phone Handoff |
| copyPhoneReturnPayload | 18227 | QR / Phone Handoff |
| copyText | 19084 | General/App State |
| copyTodayRoundsPrompt | 10716 | General/App State |
| countReviewPayloadItems | 6623 | General/App State |
| createNewWorkupFromAI | 7728 | Workup Studio & Contribution |
| createPatientFromAdmission | 3822 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 16129 | QR / Phone Handoff |
| createPhonePayload | 18070 | QR / Phone Handoff |
| createPhoneQrDeepLink | 16824 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 16805 | QR / Phone Handoff |
| createPhoneReturnPayload | 18222 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 18194 | QR / Phone Handoff |
| createPhoneReturnQrText | 18673 | QR / Phone Handoff |
| createVaultFromPassword | 3569 | De-identification & Vault |
| createWorkupStudioSourceDraft | 5792 | Workup Studio & Contribution |
| createZxingQrReader | 17257 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 17892 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 10487 | Continuity |
| currentContributionPromptOptions | 7483 | Workup Studio & Contribution |
| currentOpenEvidencePromptTemplate | 14591 | Evidence & Physical Exam |
| currentPhoneManifestHash | 17867 | QR / Phone Handoff |
| currentPhonePayload | 16060 | QR / Phone Handoff |
| currentPhoneTransferCode | 16021 | QR / Phone Handoff |
| currentRefinementInputText | 15905 | General/App State |
| currentRouteOrWorkspace | 3493 | General/App State |
| currentWorkupStudioPromptText | 6001 | Workup Studio & Contribution |
| decodePhoneBundleInput | 17918 | QR / Phone Handoff |
| decodePhoneQrToken | 16717 | QR / Phone Handoff |
| decodePhoneReturnInput | 18911 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 18617 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 17381 | QR / Phone Handoff |
| decryptVaultPayload | 2625 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 16336 | Workup Studio & Contribution |
| defaultDraftFor | 8359 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 16348 | Workup Studio & Contribution |
| deidentifyDailyInputs | 10507 | De-identification & Vault |
| deidentifyText | 1834 | De-identification & Vault |
| deleteVault | 3788 | De-identification & Vault |
| demoCasePatient | 3651 | Patient Roster / Admission |
| derivedQrChecklistOptions | 16213 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 2589 | De-identification & Vault |
| dischargePatient | 3889 | Patient Roster / Admission |
| downloadFile | 19101 | General/App State |
| duplicateWorkupStudioSectionItem | 6771 | Workup Studio & Contribution |
| editedImportedAnswerValue | 15480 | General/App State |
| effectiveClinicalIntentRegistry | 11363 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4209 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 11863 | General/App State |
| effectiveLocalWorkupModule | 4197 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4225 | General/App State |
| effectiveWorkupStudioModule | 5500 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 5722 | General/App State |
| emptyWorkupStudioBackendState | 4527 | Workup Studio & Contribution |
| encodePhoneQrToken | 16713 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 18590 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 16074 | De-identification & Vault |
| encryptedVaultRecord | 2635 | De-identification & Vault |
| encryptVaultPayload | 2611 | De-identification & Vault |
| endorsementComponentsForItem | 12970 | General/App State |
| endorsementComponentsFromOptions | 12963 | General/App State |
| endorsementEntry | 13040 | General/App State |
| endorsementEntryStatus | 13044 | General/App State |
| endorsementStatusFor | 13050 | General/App State |
| ensureFindingsPhoneHandoffReady | 8303 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 9218 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 11177 | General/App State |
| ensureWorkup | 11929 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 4665 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5281 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 6065 | Workup Studio & Contribution |
| escapeHtml | 14396 | General/App State |
| escapeObjectiveRegex | 8575 | General/App State |
| evaluateUiComplaintCds | 11911 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 11852 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 15682 | General/App State |
| expandCompactAnswerComponent | 18300 | General/App State |
| expandCompactAnswerValueList | 18389 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 18482 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 16199 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 18331 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 18396 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 16185 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 18508 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 18364 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 18423 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 16271 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 16301 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 16646 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 18563 | QR / Phone Handoff |
| expandManifestItemPatch | 16412 | General/App State |
| expandManifestSectionPatch | 16385 | General/App State |
| explicitChecklistArray | 12717 | Checklist / Complaint CDS / Clinical Intent |
| exportWorkupStudioPatch | 7808 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 9667 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 12269 | General/App State |
| fallbackComplaintResult | 11882 | General/App State |
| fallbackPatient | 2653 | Patient Roster / Admission |
| fillPatientChecklistEditorFromEntry | 9148 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 10515 | General/App State |
| filterCurrentChecklistMap | 17902 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 9375 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 20192 | General/App State |
| findNamedViewRoute | 20221 | General/App State |
| findPatientChecklistPatchEntry | 9848 | Checklist / Complaint CDS / Clinical Intent |
| flushVaultSave | 3235 | De-identification & Vault |
| focusChecklistNote | 13562 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 13569 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 7832 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 7818 | Workup Studio & Contribution |
| formatAnswerValue | 13143 | Generic Utilities |
| formatCompletionSectionTitle | 13804 | Generic Utilities |
| formatRoundsReportAsText | 14919 | Generic Utilities |
| formatStudioOptionList | 6868 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 7619 | Workup Studio & Contribution |
| genericObjectiveDataSpec | 8504 | General/App State |
| getOpenEvidencePromptText | 14717 | Evidence & Physical Exam |
| getSourceText | 11107 | General/App State |
| guardWorkupCopyAction | 11718 | Workup Studio & Contribution |
| guidelineItemText | 8790 | General/App State |
| handleClearAllPrompts | 14687 | General/App State |
| handleConfirmPromptClick | 14699 | General/App State |
| handleMissingWorkupAction | 8013 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 17598 | QR / Phone Handoff |
| handleResizeKeydown | 3401 | General/App State |
| handleSavePromptTemplateClick | 14620 | General/App State |
| handleTogglePromptWorkbench | 14681 | General/App State |
| handleWorkupStudioAuthStateChange | 5245 | Workup Studio & Contribution |
| hasChecklistFinding | 13164 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 9007 | General/App State |
| hideNewWorkupDialog | 7442 | Workup Studio & Contribution |
| htmlToTemplate | 14405 | General/App State |
| hydrateIcons | 4134 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5142 | Workup Studio & Contribution |
| iconSvg | 4085 | General/App State |
| importedAnswerSummaryRows | 15457 | General/App State |
| importPhoneFindings | 19047 | QR / Phone Handoff |
| importPhoneFindingsFromText | 18984 | QR / Phone Handoff |
| includedItems | 11873 | General/App State |
| indexesFromBitsetBytes | 18457 | General/App State |
| insertPromptVariable | 14541 | General/App State |
| installLayoutResizers | 3418 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 9363 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4173 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 12929 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4272 | Workup Studio & Contribution |
| isCompactPatientDevice | 8265 | Patient Roster / Admission |
| isDefaultServicePreferences | 2703 | Service Preferences & Picker |
| isDkaObjectiveModule | 8473 | Checklist / Complaint CDS / Clinical Intent |
| isLocallyMirroredHidden | 11388 | General/App State |
| isPhoneWorkflowDevice | 8269 | QR / Phone Handoff |
| isRoundsPasteBackTask | 14271 | General/App State |
| itemFindingText | 13157 | General/App State |
| itemNote | 13149 | Notes / H&P / Discharge |
| itemText | 12008 | General/App State |
| jsQrDecodeFromCanvas | 17368 | QR / Phone Handoff |
| jumpToPatientPanel | 11097 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 17847 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 5834 | Workup Studio & Contribution |
| listLocalDraftWorkups | 2012 | Workup Studio & Contribution |
| loadDemoCase | 3744 | General/App State |
| loadDesktopPhoneBundle | 17965 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 17153 | QR / Phone Handoff |
| loadLayoutPreferences | 3315 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 1992 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 17186 | QR / Phone Handoff |
| loadServicePreferences | 2738 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5077 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 5468 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 4838 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 5797 | Workup Studio & Contribution |
| loadWorkupStudioState | 5315 | Workup Studio & Contribution |
| localQrChunkFromText | 16756 | QR / Phone Handoff |
| localQrChunkText | 16752 | QR / Phone Handoff |
| localQrScannerAvailable | 17253 | Lab Timeline |
| localWorkupChangeSetsForModule | 4189 | Workup Studio & Contribution |
| lockVault | 3764 | De-identification & Vault |
| looksLikePhoneBundleText | 18938 | QR / Phone Handoff |
| manifestItemById | 16450 | General/App State |
| manifestSectionById | 16446 | General/App State |
| manifestSectionMeta | 16353 | General/App State |
| markAllOpenChecklistItemsReviewed | 13741 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 13759 | Checklist / Complaint CDS / Clinical Intent |
| markPatientDerivedArtifactsStale | 11042 | Patient Roster / Admission |
| matchingChecklistOption | 13226 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 5437 | Workup Studio & Contribution |
| minimalContributionContext | 7469 | Workup Studio & Contribution |
| missingObjectiveRows | 8674 | General/App State |
| mobileSectionTabLabel | 13596 | Lab Timeline |
| modifierOptions | 1635 | General/App State |
| moduleApplicabilityAsLimitation | 11549 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 11403 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 11392 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4233 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4495 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4486 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4244 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4458 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4301 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4342 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4358 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4500 | Checklist / Complaint CDS / Clinical Intent |
| moveServicePickerActiveOption | 2851 | Service Preferences & Picker |
| multiSelectChecklistItem | 13078 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 17357 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 17338 | Lab Timeline |
| normalizedAnswerComponent | 12804 | General/App State |
| normalizedChecklistSearch | 13299 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 11339 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 13107 | General/App State |
| normalizedPatientChecklistEditOptions | 9307 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4384 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 9624 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 9649 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 9633 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 6089 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 9444 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 2673 | Service Preferences & Picker |
| normalizeState | 3042 | General/App State |
| normalizeSupabaseUrl | 4548 | Supabase & Auth |
| normalizeWorkupStudioEmail | 4687 | Workup Studio & Contribution |
| numericObjectiveValue | 8610 | General/App State |
| objectiveDataContextText | 8701 | General/App State |
| objectiveDataRows | 8649 | General/App State |
| objectiveDataSpec | 8530 | General/App State |
| objectiveExtractedValueForField | 8593 | General/App State |
| objectiveHintForField | 8615 | General/App State |
| objectiveNumber | 9003 | General/App State |
| objectiveRequiredRows | 8670 | General/App State |
| objectiveSearchText | 8549 | Generic Utilities |
| objectiveSourceForField | 8603 | General/App State |
| objectiveStatusLine | 8678 | General/App State |
| objectiveValueById | 8999 | General/App State |
| objectiveValueForField | 8597 | General/App State |
| openAdmissionOverlay | 3805 | Patient Roster / Admission |
| openEvidencePromptFields | 14585 | Evidence & Physical Exam |
| openEvidencePromptVariables | 14321 | Evidence & Physical Exam |
| openFinalFindingsReview | 18887 | General/App State |
| openImportedPhoneAnswerItem | 15513 | QR / Phone Handoff |
| openPhiOverlay | 19069 | General/App State |
| openPhoneChecklistPrimary | 10333 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 18864 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 18897 | QR / Phone Handoff |
| openQuickDeid | 11305 | De-identification & Vault |
| openRebuildChecklistConfirmation | 3904 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 2840 | Service Preferences & Picker |
| openServiceSettings | 3005 | General/App State |
| openVaultFromPassword | 3547 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 9050 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 7857 | Workup Studio & Contribution |
| optionDisplayLabel | 12827 | Lab Timeline |
| optionFromItemValue | 12711 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 12934 | General/App State |
| optionsFromPatchItem | 9784 | General/App State |
| parsedObjectiveValue | 8579 | Generic Utilities |
| parsePatientChecklistEntryValue | 9098 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 9558 | Generic Utilities |
| parseStructuredWorkupRefinement | 12355 | Workup Studio & Contribution |
| parseStudioOptionList | 6856 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 6138 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 18171 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 19051 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 9501 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 2649 | Patient Roster / Admission |
| patientChecklistEditConfig | 9061 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 9113 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 9327 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 9290 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 9094 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 9802 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 9090 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 9495 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 10000 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 9489 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 9484 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 9938 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 9532 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 10031 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 9952 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 9919 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 10008 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 9996 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 10026 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 9463 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 9449 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 9475 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 9685 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 10441 | Continuity |
| patientDraft | 8372 | Patient Roster / Admission |
| patientHasFollowUpContext | 8273 | Patient Roster / Admission |
| patientList | 2644 | Patient Roster / Admission |
| patientMatchesSearch | 10395 | Patient Roster / Admission |
| patientObjectiveRecord | 8536 | Patient Roster / Admission |
| patientPatchItemFields | 9772 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4310 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 8287 | Lab Timeline |
| patientWorkupPanelElement | 9011 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 6076 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 5447 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 17863 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 17842 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 16454 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 10194 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 16814 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 16099 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 16103 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 16161 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 16112 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 16025 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 15532 | QR / Phone Handoff |
| phoneImportSectionKey | 15525 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 16798 | QR / Phone Handoff |
| phonePayloadTransferText | 16068 | QR / Phone Handoff |
| phoneQrChunkFromText | 16771 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 16866 | QR / Phone Handoff |
| phoneQrStatusHint | 16955 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 16948 | QR / Phone Handoff |
| phoneQrSvgForLink | 16940 | QR / Phone Handoff |
| phoneQrTokenFromText | 16736 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 18655 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 18705 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 18731 | QR / Phone Handoff |
| phoneReturnTokenFromText | 18639 | QR / Phone Handoff |
| plainObject | 16017 | General/App State |
| populatePatientWorkupSelect | 8123 | Workup Studio & Contribution |
| populateServiceSelect | 2749 | General/App State |
| populateWorkupStudioItemGroupSelect | 6823 | Workup Studio & Contribution |
| populateWorkupStudioSourceMetadataDefaults | 5766 | Workup Studio & Contribution |
| postgrestInFilter | 5046 | Generic Utilities |
| prepareGithubContribution | 7590 | Workup Studio & Contribution |
| preparePhoneHandoff | 18955 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 17324 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3497 | General/App State |
| primeChecklistWorkflow | 20239 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 14492 | General/App State |
| publicCatalogWorkupStatus | 6234 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 4564 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 7661 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 6318 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 6371 | Workup Studio & Contribution |
| qrModeForText | 16894 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 17265 | QR / Phone Handoff |
| qrSvgForSegments | 16898 | QR / Phone Handoff |
| qrSvgForText | 16920 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 16924 | QR / Phone Handoff |
| queryText | 20188 | General/App State |
| randomBase64 | 2583 | General/App State |
| rawModuleById | 4185 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 10426 | Evidence & Physical Exam |
| readLocalDraftWorkups | 1970 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 4945 | Workup Studio & Contribution |
| readServiceFields | 2950 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 3919 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4306 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4279 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 10189 | General/App State |
| refinementSlug | 12265 | General/App State |
| refreshClinicalApplicabilityControls | 11702 | General/App State |
| refreshSupabaseWorkupCatalogForCurrentSession | 5163 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 6436 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 6013 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 9256 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 2005 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 9431 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 6803 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 13814 | Evidence & Physical Exam |
| renderCaseStatus | 15994 | General/App State |
| renderChecklist | 13926 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 13512 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 13622 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 8001 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 11633 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 7527 | Workup Studio & Contribution |
| renderEvidenceReferenceCards | 13411 | Evidence & Physical Exam |
| renderFinalUpdate | 15986 | General/App State |
| renderGenericPasteBackPreview | 15117 | General/App State |
| renderHandoff | 18977 | General/App State |
| renderImportedPhoneAnswerSummary | 15548 | QR / Phone Handoff |
| renderModifierChips | 11730 | General/App State |
| renderObjectiveChips | 8737 | General/App State |
| renderObjectiveDataSurfaces | 9042 | General/App State |
| renderObjectiveEditor | 8754 | General/App State |
| renderObjectiveHeader | 8721 | General/App State |
| renderObjectiveReadOnlySurfaces | 9022 | General/App State |
| renderOverviewPasteBackResults | 15014 | General/App State |
| renderOverviewRoundsReport | 14947 | General/App State |
| renderPatientChecklistEditor | 9168 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 9736 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 10889 | Patient Roster / Admission |
| renderPatientRail | 10895 | Patient Roster / Admission |
| renderPatientRosterToggle | 4044 | Patient Roster / Admission |
| renderPatientTabs | 8341 | Patient Roster / Admission |
| renderPatientWorkspace | 10761 | Patient Roster / Admission |
| renderPatientWorkupResults | 8042 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 10292 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 10229 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 16981 | QR / Phone Handoff |
| renderPhoneQrCode | 17027 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 18738 | QR / Phone Handoff |
| renderPromptVariableBar | 14556 | General/App State |
| renderRoundsPasteBackPreview | 15075 | General/App State |
| renderSelectedWorkupCard | 8104 | Workup Studio & Contribution |
| renderServicePicker | 2804 | Service Preferences & Picker |
| renderServicePreferenceSummary | 2990 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 14868 | General/App State |
| renderStudioItemEditor | 7054 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 7277 | Workup Studio & Contribution |
| renderTodayCockpit | 10617 | General/App State |
| renderTodayReviewList | 10593 | General/App State |
| renderUnsupportedClinicalIntentResult | 7969 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 10133 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupOrderResultSurfaces | 9015 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 8833 | Workup Studio & Contribution |
| renderWorkupRows | 12013 | Workup Studio & Contribution |
| renderWorkupRowsInto | 12029 | Workup Studio & Contribution |
| renderWorkupStudio | 7405 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 4584 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 7325 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 7352 | Workup Studio & Contribution |
| renderWorkupStudioList | 6544 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 6651 | Workup Studio & Contribution |
| reorderById | 16506 | General/App State |
| repairOpenEvidencePatchCandidate | 9600 | Evidence & Physical Exam |
| replaceAllLiteral | 14338 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5012 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 14646 | Evidence & Physical Exam |
| resetNoSaveSession | 3619 | Supabase & Auth |
| resetPhoneQrChunkScanner | 17555 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 17559 | QR / Phone Handoff |
| resetWorkflowArtifacts | 3017 | General/App State |
| resetWorkupStudioPromptTemplate | 6005 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 14752 | Evidence & Physical Exam |
| resolvePromptTemplate | 14503 | General/App State |
| resolveUiComplaintModule | 11801 | Checklist / Complaint CDS / Clinical Intent |
| restoreState | 3212 | General/App State |
| reviewedSourceContextText | 10391 | General/App State |
| roundsPasteBackSummaryText | 15063 | General/App State |
| routeForNamedView | 20205 | General/App State |
| runQuickDeid | 11314 | De-identification & Vault |
| runWorkspaceContinuityDeid | 11250 | De-identification & Vault |
| runWorkspaceDeid | 11195 | De-identification & Vault |
| sameManifestItem | 16371 | General/App State |
| sameManifestSectionMeta | 16367 | General/App State |
| sameStringArray | 16363 | General/App State |
| sanitizeRefinementItem | 12277 | General/App State |
| sanitizeStructuredWorkupRefinement | 12322 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 14630 | Evidence & Physical Exam |
| saveGenericPasteBackForActivePatient | 15226 | Patient Roster / Admission |
| saveLayoutPreferences | 3250 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 1997 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 1980 | Workup Studio & Contribution |
| savePatientContinuityCase | 10466 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 15190 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 15151 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 9414 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 11090 | Patient Roster / Admission |
| saveServicePreferences | 2719 | Service Preferences & Picker |
| saveState | 3223 | General/App State |
| saveStructuredRefinement | 15831 | General/App State |
| saveTodayUpdate | 10679 | General/App State |
| saveWorkspaceContext | 11048 | General/App State |
| saveWorkspaceContinuity | 11063 | Continuity |
| saveWorkspaceFindings | 11075 | General/App State |
| saveWorkupStudioChangeSet | 6465 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 5981 | Workup Studio & Contribution |
| saveWorkupStudioState | 5361 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5369 | Workup Studio & Contribution |
| schedulePatientWorkupSearch | 8181 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 17218 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 17667 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 8170 | Workup Studio & Contribution |
| scrollChecklistEntry | 13614 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 8258 | Patient Roster / Admission |
| searchFieldParts | 4325 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 11612 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 12312 | General/App State |
| selectClinicalIntent | 11660 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 11411 | General/App State |
| selectedChecklistSourceIds | 13385 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 11371 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 11347 | General/App State |
| selectedKnowledgeModule | 11367 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 9109 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 10355 | Patient Roster / Admission |
| selectedStudioItem | 5564 | Workup Studio & Contribution |
| selectedTask | 14267 | General/App State |
| selectedWorkupApplicabilityIssue | 11532 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 5522 | Workup Studio & Contribution |
| selectPatient | 10989 | Patient Roster / Admission |
| selectPatientWorkupModule | 8190 | Workup Studio & Contribution |
| selectServiceFromPicker | 2863 | General/App State |
| sendWorkupStudioMagicLink | 4713 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 2928 | Service Preferences & Picker |
| servicePickerForPrefix | 2762 | Service Preferences & Picker |
| servicePickerMatches | 2781 | Service Preferences & Picker |
| servicePickerOptions | 2847 | Service Preferences & Picker |
| servicePreferenceContextText | 2692 | Service Preferences & Picker |
| servicePreferenceLabel | 2685 | Lab Timeline |
| serviceProfileById | 2669 | Service Preferences & Picker |
| serviceProfileSearchText | 2772 | Service Preferences & Picker |
| serviceUserContext | 2710 | Service Preferences & Picker |
| setBedsideCompletionState | 13858 | Evidence & Physical Exam |
| setBedsideNoteValue | 10417 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 8245 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 13060 | General/App State |
| setFieldValueIfInactive | 10492 | General/App State |
| setHandoffStatus | 17957 | General/App State |
| setLayoutNavCollapsed | 3359 | Layout & Navigation Chrome |
| setLayoutSize | 3394 | Layout & Navigation Chrome |
| setObjectiveDataValue | 8709 | General/App State |
| setPatientChecklistEditStatus | 9117 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 9729 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4064 | Patient Roster / Admission |
| setPatientTab | 8310 | Patient Roster / Admission |
| setPatientWorkupPane | 4141 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 17945 | QR / Phone Handoff |
| setPhoneQrScannerActive | 17228 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 17208 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 18856 | QR / Phone Handoff |
| setPromptTemplateEditingState | 14600 | General/App State |
| setReturnQrScannerActive | 17677 | QR / Phone Handoff |
| setReturnQrScannerStatus | 17657 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4316 | Workup Studio & Contribution |
| setServiceFields | 2918 | Service Preferences & Picker |
| setSourceMode | 11139 | General/App State |
| setStatus | 3239 | General/App State |
| setTodayWorkflowMode | 10479 | General/App State |
| setupPromptEditorAutocomplete | 19113 | General/App State |
| setVaultStatus | 2565 | De-identification & Vault |
| setWorkupNavOpen | 3369 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3288 | Workup Studio & Contribution |
| setWorkupStudioInspectorOpen | 7847 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3387 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 5702 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 5694 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 18141 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 20329 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 13731 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 18903 | Evidence & Physical Exam |
| showNewWorkupDialog | 7429 | Workup Studio & Contribution |
| showVaultAccess | 3452 | De-identification & Vault |
| showView | 3977 | General/App State |
| signOutWorkupStudioSupabase | 5241 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 11670 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 12939 | General/App State |
| snapshotChecklistResponseArtifacts | 9243 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4462 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5060 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 13404 | General/App State |
| splitChecklistOptions | 12688 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 17791 | General/App State |
| stableJsonValue | 17776 | General/App State |
| stableWorkupStudioItemId | 6163 | Workup Studio & Contribution |
| startFullFrameQrFallback | 17395 | QR / Phone Handoff |
| startManualQrScanner | 17463 | QR / Phone Handoff |
| startPhoneQrScanner | 17616 | QR / Phone Handoff |
| startReturnQrScanner | 17698 | QR / Phone Handoff |
| startRobustQrScanner | 17544 | QR / Phone Handoff |
| startSinglePatientWorkflow | 3644 | Patient Roster / Admission |
| startZxingQrScanner | 17504 | QR / Phone Handoff |
| stopPhoneQrCarousel | 16969 | QR / Phone Handoff |
| stopPhoneQrScanner | 17235 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 16975 | QR / Phone Handoff |
| stopReturnQrScanner | 17684 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 12387 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 9540 | General/App State |
| structuredRefinementSummary | 14849 | General/App State |
| studioDefaultItemType | 6892 | Workup Studio & Contribution |
| studioGeneratedItemId | 6903 | Workup Studio & Contribution |
| studioItemAnswerMode | 6883 | Workup Studio & Contribution |
| studioItemNormalAnswers | 6879 | Workup Studio & Contribution |
| studioItemOptions | 6872 | Workup Studio & Contribution |
| studioNewItemForSection | 6911 | Workup Studio & Contribution |
| studioSectionDefinition | 5545 | Workup Studio & Contribution |
| studioSectionItems | 5553 | Workup Studio & Contribution |
| studioSectionPayload | 5549 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 5570 | Workup Studio & Contribution |
| submitNewWorkupForReview | 7707 | Workup Studio & Contribution |
| supabaseAuthHeaders | 4750 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 5401 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 4877 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5071 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5158 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 4893 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5041 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5054 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 2976 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 11792 | General/App State |
| syncImportedAnswerSummaryRow | 15488 | General/App State |
| syncLayoutForViewport | 3342 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 11679 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 15442 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 15243 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 9123 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 9455 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 10404 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 10535 | General/App State |
| syncWorkupConcernInputs | 10430 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 14895 | Workup Studio & Contribution |
| syncWorkupSelectors | 8147 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 5969 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 5529 | Workup Studio & Contribution |
| taskDescription | 4160 | General/App State |
| taskHasPasteBack | 14276 | General/App State |
| taskIsPlainEvidenceReview | 14280 | Evidence & Physical Exam |
| taskLabel | 4156 | Lab Timeline |
| titleCaseComponent | 12812 | General/App State |
| titleFromId | 1344 | General/App State |
| todayBaselinePatchFromElements | 10526 | General/App State |
| todayDateKey | 10437 | General/App State |
| todayInputsFromElements | 10498 | General/App State |
| todayPromptTaskId | 10563 | General/App State |
| todaySourceContext | 10548 | General/App State |
| todayWorkflowMode | 10471 | General/App State |
| toggleChecklistAnswer | 13119 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4076 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3294 | Workup Studio & Contribution |
| toggleWorkupStudioPanel | 7839 | Workup Studio & Contribution |
| trimCompactQrRow | 16171 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 11827 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 12726 | General/App State |
| uniqueChecklistOptions | 12703 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 9313 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 11848 | General/App State |
| unlockVault | 3538 | De-identification & Vault |
| updateBedsideCaseTitles | 13589 | Evidence & Physical Exam |
| updateChecklistAnswer | 13036 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 13893 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 6963 | General/App State |
| updateOpenEvidenceChangePreview | 15284 | Evidence & Physical Exam |
| updatePatient | 3877 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 8688 | Patient Roster / Admission |
| updateServiceCustomField | 2960 | General/App State |
| updateServiceSettingsPreview | 2997 | General/App State |
| updateWorkupSearchOnly | 8153 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 6223 | Workup Studio & Contribution |
| validateContributionInput | 7562 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 7653 | Workup Studio & Contribution |
| validPublicCatalogSnapshot | 4920 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 2556 | De-identification & Vault |
| vaultPayload | 3218 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 6239 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 10412 | Evidence & Physical Exam |
| visibleChecklistEntries | 13348 | Checklist / Complaint CDS / Clinical Intent |
| withZxingFallbackStop | 17452 | General/App State |
| workupCatalogSupabaseRequest | 4804 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 11822 | Workup Studio & Contribution |
| workupExamRows | 8808 | Workup Studio & Contribution |
| workupItemSearchText | 8492 | Workup Studio & Contribution |
| workupItemsForRow | 8786 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3284 | Workup Studio & Contribution |
| workupMatchBadge | 7867 | Workup Studio & Contribution |
| workupPickerGroups | 7909 | Workup Studio & Contribution |
| workupSearchTokens | 4392 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 4683 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 4568 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 4560 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 4572 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 4580 | Workup Studio & Contribution |
| workupStudioCanReview | 4576 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 6021 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 5490 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 6691 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 6171 | Workup Studio & Contribution |
| workupStudioItemSearchText | 6835 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 5494 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 4691 | Workup Studio & Contribution |
| workupStudioModuleMatches | 5508 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 6720 | Workup Studio & Contribution |
| workupStudioNodeRationale | 6051 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 6055 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 6027 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 6040 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 4708 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 5850 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 5646 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 5588 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 5952 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 5598 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 6193 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 5958 | Workup Studio & Contribution |
| workupStudioSectionIcon | 6607 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 5615 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 5846 | Workup Studio & Contribution |
| workupStudioSectionMeta | 6640 | Workup Studio & Contribution |
| workupStudioSectionMetric | 6632 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 6059 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 5746 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 5729 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 5778 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 5714 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 4762 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 4776 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 6707 | Workup Studio & Contribution |
| writePublicWorkupCatalogCache | 4929 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 17249 | Lab Timeline |
| zxingResultText | 17332 | General/App State |
