# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1333-20370`) with:

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
| _flushWorkupStudioState | 4514 | Workup Studio & Contribution |
| _loadDeidModel | 1675 | De-identification & Vault |
| $ | 2006 | General/App State |
| $$ | 2007 | General/App State |
| acceptWorkupStudioImport | 7782 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 14931 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 13368 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4168 | Patient Roster / Admission |
| addItemSourceIds | 13391 | General/App State |
| addPatientChecklistItemFromEditor | 9401 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 13376 | General/App State |
| addWorkupStudioItem | 6956 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 6750 | Workup Studio & Contribution |
| admitPatientFromForm | 3857 | Patient Roster / Admission |
| allChecklistEntries | 13303 | Checklist / Complaint CDS / Clinical Intent |
| answeredChecklistCount | 13184 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 12692 | General/App State |
| answerTone | 13194 | General/App State |
| answerToneForOption | 13205 | General/App State |
| answerValueList | 13014 | General/App State |
| answerValueSelected | 13119 | General/App State |
| appendWorkupGroup | 4482 | Workup Studio & Contribution |
| appendWorkupOption | 4475 | Workup Studio & Contribution |
| applicabilityIssueForModule | 11451 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5004 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 15909 | Checklist / Complaint CDS / Clinical Intent |
| applyDeidResult | 11160 | De-identification & Vault |
| applyInitialRouteState | 20312 | General/App State |
| applyLayoutPreferences | 3262 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 9863 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 16534 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 14672 | General/App State |
| applyServiceFields | 2987 | Service Preferences & Picker |
| applyStreamCameraHints | 17329 | General/App State |
| applyStructuredRefinementText | 15876 | General/App State |
| applyStructuredRefinementToSections | 12376 | General/App State |
| applySupabaseWorkupCatalog | 4959 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 10737 | Evidence & Physical Exam |
| applyVaultPayload | 3161 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3302 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3379 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 6290 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5183 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5195 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 17318 | General/App State |
| approveLatestWorkupStudioChangeSet | 6522 | Workup Studio & Contribution |
| asArray | 11813 | General/App State |
| assertChecklistAnswerState | 13020 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 17904 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 17887 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 2582 | General/App State |
| baseChecklistOptionsForItem | 12712 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1354 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4185 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 19364 | General/App State |
| bindServicePicker | 2878 | Service Preferences & Picker |
| bitsetBytesForIndexes | 18463 | General/App State |
| broadEndorsementQuestion | 12974 | General/App State |
| buildPatientChecklistInWorkspace | 12669 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 17840 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 10573 | General/App State |
| buildWorkupStudioSourcePrompt | 5791 | Workup Studio & Contribution |
| bytesToBase64 | 2576 | General/App State |
| cameraTrackEnhancementConstraints | 17306 | General/App State |
| captureWorkupStudioAuthRedirectError | 5266 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5381 | Supabase & Auth |
| checklistAnswerMetadataForItem | 12747 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 14322 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 18275 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 18288 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 13292 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 8800 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 18269 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 13345 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 13323 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 8809 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 18451 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 18455 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4270 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4263 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 9994 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 18261 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 18459 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 12700 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4252 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 13246 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 13089 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 16222 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 12814 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 14300 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 13212 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 13169 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 13352 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 13233 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 12696 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 13129 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 20243 | General/App State |
| chunkPhoneQrToken | 16873 | QR / Phone Handoff |
| clampLayoutSize | 3247 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 10669 | General/App State |
| cleanEndorsementComponent | 12885 | General/App State |
| cleanPhoneQrUrl | 17191 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 5694 | Workup Studio & Contribution |
| clearActiveChecklistSection | 13716 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 13734 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 8226 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 8238 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 15712 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 9215 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 17228 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 17677 | QR / Phone Handoff |
| clearStalePhonePayload | 16061 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5029 | Workup Studio & Contribution |
| clearWorkupStudioAuthSession | 4832 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 5826 | Workup Studio & Contribution |
| clinicalIntentModifierText | 11370 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 7962 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 11359 | General/App State |
| cloneJson | 4172 | General/App State |
| clonePatient | 2550 | Patient Roster / Admission |
| closeAdmissionOverlay | 3822 | Patient Roster / Admission |
| closeAllServicePickers | 2802 | Service Preferences & Picker |
| closeDischargeConfirmation | 3888 | Notes / H&P / Discharge |
| closePhiOverlay | 19095 | General/App State |
| closePhoneReturnQr | 18866 | QR / Phone Handoff |
| closeQuickDeid | 11326 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 3904 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 2791 | Service Preferences & Picker |
| closeServiceSettings | 3016 | General/App State |
| closestReviewedModules | 7880 | Checklist / Complaint CDS / Clinical Intent |
| closeWorkupStudioEditorDrawer | 7325 | Workup Studio & Contribution |
| coercePatientTabForDevice | 8299 | Patient Roster / Admission |
| collectPhoneQrChunk | 17602 | QR / Phone Handoff |
| collectQrChunk | 17579 | QR / Phone Handoff |
| collectReturnQrChunk | 17608 | QR / Phone Handoff |
| commitChecklistAnswer | 13037 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 15517 | QR / Phone Handoff |
| compactAnswerComponent | 18300 | General/App State |
| compactAnswerKeyParts | 18256 | General/App State |
| compactAnswerMenuItem | 13115 | General/App State |
| compactChecklistAnswerBitsetPayload | 18482 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 16207 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 18333 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 18393 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 16194 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 17811 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 18514 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 18369 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 18429 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 16239 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 16265 | Checklist / Complaint CDS / Clinical Intent |
| compactFieldId | 8490 | General/App State |
| compactManifestItemPatch | 16414 | General/App State |
| compactManifestSectionPatch | 16391 | General/App State |
| compactMenuViewport | 3342 | General/App State |
| compactPhoneHandoffDeltaPayloadForQr | 16621 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 16597 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 18575 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 18536 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 18554 | QR / Phone Handoff |
| compactReturnAnswerCount | 18678 | General/App State |
| compactReturnNoteCount | 18684 | Notes / H&P / Discharge |
| compactStringFingerprint | 17770 | Generic Utilities |
| compactStringFingerprint64 | 17780 | Generic Utilities |
| compactWorkupStudioPromptLine | 5586 | Workup Studio & Contribution |
| complaintModuleForSelectedIntents | 11399 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 13805 | General/App State |
| componentFromQuestionLabel | 12905 | Lab Timeline |
| componentsFromQuestionLabel | 12922 | Lab Timeline |
| confirmDischargePatient | 3947 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 15729 | QR / Phone Handoff |
| confirmRebuildChecklist | 3938 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 7453 | Workup Studio & Contribution |
| contributionDraftTriggers | 7470 | Workup Studio & Contribution |
| contributionDraftWorkupId | 7464 | Workup Studio & Contribution |
| contributionExamCatalog | 7523 | Workup Studio & Contribution |
| contributionPrompt | 7506 | Workup Studio & Contribution |
| copyContributionPrompt | 7510 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 10119 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 18142 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 17150 | QR / Phone Handoff |
| copyPhoneReturnPayload | 18243 | QR / Phone Handoff |
| copyText | 19100 | General/App State |
| copyTodayRoundsPrompt | 10722 | General/App State |
| countReviewPayloadItems | 6629 | General/App State |
| createNewWorkupFromAI | 7734 | Workup Studio & Contribution |
| createPatientFromAdmission | 3826 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 16145 | QR / Phone Handoff |
| createPhonePayload | 18086 | QR / Phone Handoff |
| createPhoneQrDeepLink | 16840 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 16821 | QR / Phone Handoff |
| createPhoneReturnPayload | 18238 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 18210 | QR / Phone Handoff |
| createPhoneReturnQrText | 18689 | QR / Phone Handoff |
| createVaultFromPassword | 3573 | De-identification & Vault |
| createWorkupStudioSourceDraft | 5796 | Workup Studio & Contribution |
| createZxingQrReader | 17273 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 17908 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 10493 | Continuity |
| currentContributionPromptOptions | 7489 | Workup Studio & Contribution |
| currentOpenEvidencePromptTemplate | 14607 | Evidence & Physical Exam |
| currentPhoneManifestHash | 17883 | QR / Phone Handoff |
| currentPhonePayload | 16076 | QR / Phone Handoff |
| currentPhoneTransferCode | 16037 | QR / Phone Handoff |
| currentRefinementInputText | 15921 | General/App State |
| currentRouteOrWorkspace | 3497 | General/App State |
| currentWorkupStudioPromptText | 6005 | Workup Studio & Contribution |
| decodePhoneBundleInput | 17934 | QR / Phone Handoff |
| decodePhoneQrToken | 16733 | QR / Phone Handoff |
| decodePhoneReturnInput | 18927 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 18633 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 17397 | QR / Phone Handoff |
| decryptVaultPayload | 2629 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 16352 | Workup Studio & Contribution |
| defaultDraftFor | 8365 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 16364 | Workup Studio & Contribution |
| deidentifyDailyInputs | 10513 | De-identification & Vault |
| deidentifyText | 1824 | De-identification & Vault |
| deleteVault | 3792 | De-identification & Vault |
| demoCasePatient | 3655 | Patient Roster / Admission |
| derivedQrChecklistOptions | 16229 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 2593 | De-identification & Vault |
| dischargePatient | 3893 | Patient Roster / Admission |
| downloadFile | 19117 | General/App State |
| duplicateWorkupStudioSectionItem | 6777 | Workup Studio & Contribution |
| editedImportedAnswerValue | 15496 | General/App State |
| effectiveClinicalIntentRegistry | 11379 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4213 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 11879 | General/App State |
| effectiveLocalWorkupModule | 4201 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4229 | General/App State |
| effectiveWorkupStudioModule | 5504 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 5726 | General/App State |
| emptyWorkupStudioBackendState | 4531 | Workup Studio & Contribution |
| encodePhoneQrToken | 16729 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 18606 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 16090 | De-identification & Vault |
| encryptedVaultRecord | 2639 | De-identification & Vault |
| encryptVaultPayload | 2615 | De-identification & Vault |
| endorsementComponentsForItem | 12986 | General/App State |
| endorsementComponentsFromOptions | 12979 | General/App State |
| endorsementEntry | 13056 | General/App State |
| endorsementEntryStatus | 13060 | General/App State |
| endorsementStatusFor | 13066 | General/App State |
| ensureFindingsPhoneHandoffReady | 8309 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 9224 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 11193 | General/App State |
| ensureWorkup | 11945 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 4669 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5285 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 6069 | Workup Studio & Contribution |
| escapeHtml | 14412 | General/App State |
| escapeObjectiveRegex | 8581 | General/App State |
| evaluateUiComplaintCds | 11927 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 11868 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 15698 | General/App State |
| expandCompactAnswerComponent | 18316 | General/App State |
| expandCompactAnswerValueList | 18405 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 18498 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 16215 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 18347 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 18412 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 16201 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 18524 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 18380 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 18439 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 16287 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 16317 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 16662 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 18579 | QR / Phone Handoff |
| expandManifestItemPatch | 16428 | General/App State |
| expandManifestSectionPatch | 16401 | General/App State |
| explicitChecklistArray | 12733 | Checklist / Complaint CDS / Clinical Intent |
| exportWorkupStudioPatch | 7814 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 9673 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 12285 | General/App State |
| fallbackComplaintResult | 11898 | General/App State |
| fallbackPatient | 2657 | Patient Roster / Admission |
| fillPatientChecklistEditorFromEntry | 9154 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 10521 | General/App State |
| filterCurrentChecklistMap | 17918 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 9381 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 20208 | General/App State |
| findNamedViewRoute | 20237 | General/App State |
| findPatientChecklistPatchEntry | 9854 | Checklist / Complaint CDS / Clinical Intent |
| flushVaultSave | 3239 | De-identification & Vault |
| focusChecklistNote | 13578 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 13585 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 7838 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 7824 | Workup Studio & Contribution |
| formatAnswerValue | 13159 | Generic Utilities |
| formatCompletionSectionTitle | 13820 | Generic Utilities |
| formatRoundsReportAsText | 14935 | Generic Utilities |
| formatStudioOptionList | 6874 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 7625 | Workup Studio & Contribution |
| genericObjectiveDataSpec | 8510 | General/App State |
| getOpenEvidencePromptText | 14733 | Evidence & Physical Exam |
| getSourceText | 11123 | General/App State |
| guardWorkupCopyAction | 11734 | Workup Studio & Contribution |
| guidelineItemText | 8796 | General/App State |
| handleClearAllPrompts | 14703 | General/App State |
| handleConfirmPromptClick | 14715 | General/App State |
| handleMissingWorkupAction | 8019 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 17614 | QR / Phone Handoff |
| handleResizeKeydown | 3405 | General/App State |
| handleSavePromptTemplateClick | 14636 | General/App State |
| handleTogglePromptWorkbench | 14697 | General/App State |
| handleWorkupStudioAuthStateChange | 5249 | Workup Studio & Contribution |
| hasChecklistFinding | 13180 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 9013 | General/App State |
| hideNewWorkupDialog | 7448 | Workup Studio & Contribution |
| htmlToTemplate | 14421 | General/App State |
| hydrateIcons | 4138 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5146 | Workup Studio & Contribution |
| iconSvg | 4089 | General/App State |
| importedAnswerSummaryRows | 15473 | General/App State |
| importPhoneFindings | 19063 | QR / Phone Handoff |
| importPhoneFindingsFromText | 19000 | QR / Phone Handoff |
| includedItems | 11889 | General/App State |
| indexesFromBitsetBytes | 18473 | General/App State |
| insertPromptVariable | 14557 | General/App State |
| installLayoutResizers | 3422 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 9369 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4177 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 12945 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4276 | Workup Studio & Contribution |
| isCompactPatientDevice | 8271 | Patient Roster / Admission |
| isDefaultServicePreferences | 2707 | Service Preferences & Picker |
| isDkaObjectiveModule | 8479 | Checklist / Complaint CDS / Clinical Intent |
| isLocallyMirroredHidden | 11404 | General/App State |
| isPhoneWorkflowDevice | 8275 | QR / Phone Handoff |
| isRoundsPasteBackTask | 14287 | General/App State |
| itemFindingText | 13173 | General/App State |
| itemNote | 13165 | Notes / H&P / Discharge |
| itemText | 12024 | General/App State |
| jsQrDecodeFromCanvas | 17384 | QR / Phone Handoff |
| jumpToPatientPanel | 11113 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 17863 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 5838 | Workup Studio & Contribution |
| listLocalDraftWorkups | 2002 | Workup Studio & Contribution |
| loadDemoCase | 3748 | General/App State |
| loadDesktopPhoneBundle | 17981 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 17169 | QR / Phone Handoff |
| loadLayoutPreferences | 3319 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 1982 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 17202 | QR / Phone Handoff |
| loadServicePreferences | 2742 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5081 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 5472 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 4842 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 5801 | Workup Studio & Contribution |
| loadWorkupStudioState | 5319 | Workup Studio & Contribution |
| localQrChunkFromText | 16772 | QR / Phone Handoff |
| localQrChunkText | 16768 | QR / Phone Handoff |
| localQrScannerAvailable | 17269 | Lab Timeline |
| localWorkupChangeSetsForModule | 4193 | Workup Studio & Contribution |
| lockVault | 3768 | De-identification & Vault |
| looksLikePhoneBundleText | 18954 | QR / Phone Handoff |
| manifestItemById | 16466 | General/App State |
| manifestSectionById | 16462 | General/App State |
| manifestSectionMeta | 16369 | General/App State |
| markAllOpenChecklistItemsReviewed | 13757 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 13775 | Checklist / Complaint CDS / Clinical Intent |
| markPatientDerivedArtifactsStale | 11058 | Patient Roster / Admission |
| matchingChecklistOption | 13242 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 5441 | Workup Studio & Contribution |
| minimalContributionContext | 7475 | Workup Studio & Contribution |
| missingObjectiveRows | 8680 | General/App State |
| mobileSectionTabLabel | 13612 | Lab Timeline |
| modifierOptions | 1641 | General/App State |
| moduleApplicabilityAsLimitation | 11565 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 11419 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 11408 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4237 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4499 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4490 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4248 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4462 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4305 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4346 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4362 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4504 | Checklist / Complaint CDS / Clinical Intent |
| moveServicePickerActiveOption | 2855 | Service Preferences & Picker |
| multiSelectChecklistItem | 13094 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 17373 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 17354 | Lab Timeline |
| normalizedAnswerComponent | 12820 | General/App State |
| normalizedChecklistSearch | 13315 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 11355 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 13123 | General/App State |
| normalizedPatientChecklistEditOptions | 9313 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4388 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 9630 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 9655 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 9639 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 6093 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 9450 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 2677 | Service Preferences & Picker |
| normalizeState | 3046 | General/App State |
| normalizeSupabaseUrl | 4552 | Supabase & Auth |
| normalizeWorkupStudioEmail | 4691 | Workup Studio & Contribution |
| numericObjectiveValue | 8616 | General/App State |
| objectiveDataContextText | 8707 | General/App State |
| objectiveDataRows | 8655 | General/App State |
| objectiveDataSpec | 8536 | General/App State |
| objectiveExtractedValueForField | 8599 | General/App State |
| objectiveHintForField | 8621 | General/App State |
| objectiveNumber | 9009 | General/App State |
| objectiveRequiredRows | 8676 | General/App State |
| objectiveSearchText | 8555 | Generic Utilities |
| objectiveSourceForField | 8609 | General/App State |
| objectiveStatusLine | 8684 | General/App State |
| objectiveValueById | 9005 | General/App State |
| objectiveValueForField | 8603 | General/App State |
| openAdmissionOverlay | 3809 | Patient Roster / Admission |
| openEvidencePromptFields | 14601 | Evidence & Physical Exam |
| openEvidencePromptVariables | 14337 | Evidence & Physical Exam |
| openFinalFindingsReview | 18903 | General/App State |
| openImportedPhoneAnswerItem | 15529 | QR / Phone Handoff |
| openPhiOverlay | 19085 | General/App State |
| openPhoneChecklistPrimary | 10339 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 18880 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 18913 | QR / Phone Handoff |
| openQuickDeid | 11321 | De-identification & Vault |
| openRebuildChecklistConfirmation | 3908 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 2844 | Service Preferences & Picker |
| openServiceSettings | 3009 | General/App State |
| openVaultFromPassword | 3551 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 9056 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 7863 | Workup Studio & Contribution |
| optionDisplayLabel | 12843 | Lab Timeline |
| optionFromItemValue | 12727 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 12950 | General/App State |
| optionsFromPatchItem | 9790 | General/App State |
| parsedObjectiveValue | 8585 | Generic Utilities |
| parsePatientChecklistEntryValue | 9104 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 9564 | Generic Utilities |
| parseStructuredWorkupRefinement | 12371 | Workup Studio & Contribution |
| parseStudioOptionList | 6862 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 6142 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 18187 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 19067 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 9507 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 2653 | Patient Roster / Admission |
| patientChecklistEditConfig | 9067 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 9119 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 9333 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 9296 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 9100 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 9808 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 9096 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 9501 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 10006 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 9495 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 9490 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 9944 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 9538 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 10037 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 9958 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 9925 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 10014 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 10002 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 10032 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 9469 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 9455 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 9481 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 9691 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 10447 | Continuity |
| patientDraft | 8378 | Patient Roster / Admission |
| patientHasFollowUpContext | 8279 | Patient Roster / Admission |
| patientList | 2648 | Patient Roster / Admission |
| patientMatchesSearch | 10401 | Patient Roster / Admission |
| patientObjectiveRecord | 8542 | Patient Roster / Admission |
| patientPatchItemFields | 9778 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4314 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 8293 | Lab Timeline |
| patientWorkupPanelElement | 9017 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 6080 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 5451 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 17879 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 17858 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 16470 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 10200 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 16830 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 16115 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 16119 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 16177 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 16128 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 16041 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 15548 | QR / Phone Handoff |
| phoneImportSectionKey | 15541 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 16814 | QR / Phone Handoff |
| phonePayloadTransferText | 16084 | QR / Phone Handoff |
| phoneQrChunkFromText | 16787 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 16882 | QR / Phone Handoff |
| phoneQrStatusHint | 16971 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 16964 | QR / Phone Handoff |
| phoneQrSvgForLink | 16956 | QR / Phone Handoff |
| phoneQrTokenFromText | 16752 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 18671 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 18721 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 18747 | QR / Phone Handoff |
| phoneReturnTokenFromText | 18655 | QR / Phone Handoff |
| plainObject | 16033 | General/App State |
| populatePatientWorkupSelect | 8129 | Workup Studio & Contribution |
| populateServiceSelect | 2753 | General/App State |
| populateWorkupStudioItemGroupSelect | 6829 | Workup Studio & Contribution |
| populateWorkupStudioSourceMetadataDefaults | 5770 | Workup Studio & Contribution |
| postgrestInFilter | 5050 | Generic Utilities |
| prepareGithubContribution | 7596 | Workup Studio & Contribution |
| preparePhoneHandoff | 18971 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 17340 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3501 | General/App State |
| primeChecklistWorkflow | 20255 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 14508 | General/App State |
| publicCatalogWorkupStatus | 6238 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 4568 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 7667 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 6322 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 6375 | Workup Studio & Contribution |
| qrModeForText | 16910 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 17281 | QR / Phone Handoff |
| qrSvgForSegments | 16914 | QR / Phone Handoff |
| qrSvgForText | 16936 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 16940 | QR / Phone Handoff |
| queryText | 20204 | General/App State |
| randomBase64 | 2587 | General/App State |
| rawModuleById | 4189 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 10432 | Evidence & Physical Exam |
| readLocalDraftWorkups | 1960 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 4949 | Workup Studio & Contribution |
| readServiceFields | 2954 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 3923 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4310 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4283 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 10195 | General/App State |
| refinementSlug | 12281 | General/App State |
| refreshClinicalApplicabilityControls | 11718 | General/App State |
| refreshSupabaseWorkupCatalogForCurrentSession | 5167 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 6440 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 6017 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 9262 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 1995 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 9437 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 6809 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 13830 | Evidence & Physical Exam |
| renderCaseStatus | 16010 | General/App State |
| renderChecklist | 13942 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 13528 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 13638 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 8007 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 11649 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 7533 | Workup Studio & Contribution |
| renderEvidenceReferenceCards | 13427 | Evidence & Physical Exam |
| renderFinalUpdate | 16002 | General/App State |
| renderGenericPasteBackPreview | 15133 | General/App State |
| renderHandoff | 18993 | General/App State |
| renderImportedPhoneAnswerSummary | 15564 | QR / Phone Handoff |
| renderModifierChips | 11746 | General/App State |
| renderObjectiveChips | 8743 | General/App State |
| renderObjectiveDataSurfaces | 9048 | General/App State |
| renderObjectiveEditor | 8760 | General/App State |
| renderObjectiveHeader | 8727 | General/App State |
| renderObjectiveReadOnlySurfaces | 9028 | General/App State |
| renderOverviewPasteBackResults | 15030 | General/App State |
| renderOverviewRoundsReport | 14963 | General/App State |
| renderPatientChecklistEditor | 9174 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 9742 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 10895 | Patient Roster / Admission |
| renderPatientRail | 10901 | Patient Roster / Admission |
| renderPatientRosterToggle | 4048 | Patient Roster / Admission |
| renderPatientTabs | 8347 | Patient Roster / Admission |
| renderPatientWorkspace | 10767 | Patient Roster / Admission |
| renderPatientWorkupResults | 8048 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 10298 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 10235 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 16997 | QR / Phone Handoff |
| renderPhoneQrCode | 17043 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 18754 | QR / Phone Handoff |
| renderPromptVariableBar | 14572 | General/App State |
| renderRoundsPasteBackPreview | 15091 | General/App State |
| renderSelectedWorkupCard | 8110 | Workup Studio & Contribution |
| renderServicePicker | 2808 | Service Preferences & Picker |
| renderServicePreferenceSummary | 2994 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 14884 | General/App State |
| renderStudioItemEditor | 7060 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 7283 | Workup Studio & Contribution |
| renderTodayCockpit | 10623 | General/App State |
| renderTodayReviewList | 10599 | General/App State |
| renderUnsupportedClinicalIntentResult | 7975 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 10139 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupOrderResultSurfaces | 9021 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 8839 | Workup Studio & Contribution |
| renderWorkupRows | 12029 | Workup Studio & Contribution |
| renderWorkupRowsInto | 12045 | Workup Studio & Contribution |
| renderWorkupStudio | 7411 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 4588 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 7331 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 7358 | Workup Studio & Contribution |
| renderWorkupStudioList | 6548 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 6657 | Workup Studio & Contribution |
| reorderById | 16522 | General/App State |
| repairOpenEvidencePatchCandidate | 9606 | Evidence & Physical Exam |
| replaceAllLiteral | 14354 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5016 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 14662 | Evidence & Physical Exam |
| resetNoSaveSession | 3623 | Supabase & Auth |
| resetPhoneQrChunkScanner | 17571 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 17575 | QR / Phone Handoff |
| resetWorkflowArtifacts | 3021 | General/App State |
| resetWorkupStudioPromptTemplate | 6009 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 14768 | Evidence & Physical Exam |
| resolvePromptTemplate | 14519 | General/App State |
| resolveUiComplaintModule | 11817 | Checklist / Complaint CDS / Clinical Intent |
| restoreState | 3216 | General/App State |
| reviewedSourceContextText | 10397 | General/App State |
| roundsPasteBackSummaryText | 15079 | General/App State |
| routeForNamedView | 20221 | General/App State |
| runQuickDeid | 11330 | De-identification & Vault |
| runWorkspaceContinuityDeid | 11266 | De-identification & Vault |
| runWorkspaceDeid | 11211 | De-identification & Vault |
| sameManifestItem | 16387 | General/App State |
| sameManifestSectionMeta | 16383 | General/App State |
| sameStringArray | 16379 | General/App State |
| sanitizeRefinementItem | 12293 | General/App State |
| sanitizeStructuredWorkupRefinement | 12338 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 14646 | Evidence & Physical Exam |
| saveGenericPasteBackForActivePatient | 15242 | Patient Roster / Admission |
| saveLayoutPreferences | 3254 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 1987 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 1970 | Workup Studio & Contribution |
| savePatientContinuityCase | 10472 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 15206 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 15167 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 9420 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 11106 | Patient Roster / Admission |
| saveServicePreferences | 2723 | Service Preferences & Picker |
| saveState | 3227 | General/App State |
| saveStructuredRefinement | 15847 | General/App State |
| saveTodayUpdate | 10685 | General/App State |
| saveWorkspaceContext | 11064 | General/App State |
| saveWorkspaceContinuity | 11079 | Continuity |
| saveWorkspaceFindings | 11091 | General/App State |
| saveWorkupStudioChangeSet | 6469 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 5985 | Workup Studio & Contribution |
| saveWorkupStudioState | 5365 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5373 | Workup Studio & Contribution |
| schedulePatientWorkupSearch | 8187 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 17234 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 17683 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 8176 | Workup Studio & Contribution |
| scrollChecklistEntry | 13630 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 8264 | Patient Roster / Admission |
| searchFieldParts | 4329 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 11628 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 12328 | General/App State |
| selectClinicalIntent | 11676 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 11427 | General/App State |
| selectedChecklistSourceIds | 13401 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 11387 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 11363 | General/App State |
| selectedKnowledgeModule | 11383 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 9115 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 10361 | Patient Roster / Admission |
| selectedStudioItem | 5568 | Workup Studio & Contribution |
| selectedTask | 14283 | General/App State |
| selectedWorkupApplicabilityIssue | 11548 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 5526 | Workup Studio & Contribution |
| selectPatient | 11005 | Patient Roster / Admission |
| selectPatientWorkupModule | 8196 | Workup Studio & Contribution |
| selectServiceFromPicker | 2867 | General/App State |
| sendWorkupStudioMagicLink | 4717 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 2932 | Service Preferences & Picker |
| servicePickerForPrefix | 2766 | Service Preferences & Picker |
| servicePickerMatches | 2785 | Service Preferences & Picker |
| servicePickerOptions | 2851 | Service Preferences & Picker |
| servicePreferenceContextText | 2696 | Service Preferences & Picker |
| servicePreferenceLabel | 2689 | Lab Timeline |
| serviceProfileById | 2673 | Service Preferences & Picker |
| serviceProfileSearchText | 2776 | Service Preferences & Picker |
| serviceUserContext | 2714 | Service Preferences & Picker |
| setBedsideCompletionState | 13874 | Evidence & Physical Exam |
| setBedsideNoteValue | 10423 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 8251 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 13076 | General/App State |
| setFieldValueIfInactive | 10498 | General/App State |
| setHandoffStatus | 17973 | General/App State |
| setLayoutNavCollapsed | 3363 | Layout & Navigation Chrome |
| setLayoutSize | 3398 | Layout & Navigation Chrome |
| setObjectiveDataValue | 8715 | General/App State |
| setPatientChecklistEditStatus | 9123 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 9735 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4068 | Patient Roster / Admission |
| setPatientTab | 8316 | Patient Roster / Admission |
| setPatientWorkupPane | 4145 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 17961 | QR / Phone Handoff |
| setPhoneQrScannerActive | 17244 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 17224 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 18872 | QR / Phone Handoff |
| setPromptTemplateEditingState | 14616 | General/App State |
| setReturnQrScannerActive | 17693 | QR / Phone Handoff |
| setReturnQrScannerStatus | 17673 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4320 | Workup Studio & Contribution |
| setServiceFields | 2922 | Service Preferences & Picker |
| setSourceMode | 11155 | General/App State |
| setStatus | 3243 | General/App State |
| setTodayWorkflowMode | 10485 | General/App State |
| setupPromptEditorAutocomplete | 19129 | General/App State |
| setVaultStatus | 2569 | De-identification & Vault |
| setWorkupNavOpen | 3373 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3292 | Workup Studio & Contribution |
| setWorkupStudioInspectorOpen | 7853 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3391 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 5706 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 5698 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 18157 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 20345 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 13747 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 18919 | Evidence & Physical Exam |
| showNewWorkupDialog | 7435 | Workup Studio & Contribution |
| showVaultAccess | 3456 | De-identification & Vault |
| showView | 3981 | General/App State |
| signOutWorkupStudioSupabase | 5245 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 11686 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 12955 | General/App State |
| snapshotChecklistResponseArtifacts | 9249 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4466 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5064 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 13420 | General/App State |
| splitChecklistOptions | 12704 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 17807 | General/App State |
| stableJsonValue | 17792 | General/App State |
| stableWorkupStudioItemId | 6167 | Workup Studio & Contribution |
| startFullFrameQrFallback | 17411 | QR / Phone Handoff |
| startManualQrScanner | 17479 | QR / Phone Handoff |
| startPhoneQrScanner | 17632 | QR / Phone Handoff |
| startReturnQrScanner | 17714 | QR / Phone Handoff |
| startRobustQrScanner | 17560 | QR / Phone Handoff |
| startSinglePatientWorkflow | 3648 | Patient Roster / Admission |
| startZxingQrScanner | 17520 | QR / Phone Handoff |
| stopPhoneQrCarousel | 16985 | QR / Phone Handoff |
| stopPhoneQrScanner | 17251 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 16991 | QR / Phone Handoff |
| stopReturnQrScanner | 17700 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 12403 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 9546 | General/App State |
| structuredRefinementSummary | 14865 | General/App State |
| studioDefaultItemType | 6898 | Workup Studio & Contribution |
| studioGeneratedItemId | 6909 | Workup Studio & Contribution |
| studioItemAnswerMode | 6889 | Workup Studio & Contribution |
| studioItemNormalAnswers | 6885 | Workup Studio & Contribution |
| studioItemOptions | 6878 | Workup Studio & Contribution |
| studioNewItemForSection | 6917 | Workup Studio & Contribution |
| studioSectionDefinition | 5549 | Workup Studio & Contribution |
| studioSectionItems | 5557 | Workup Studio & Contribution |
| studioSectionPayload | 5553 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 5574 | Workup Studio & Contribution |
| submitNewWorkupForReview | 7713 | Workup Studio & Contribution |
| supabaseAuthHeaders | 4754 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 5405 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 4881 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5075 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5162 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 4897 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5045 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5058 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 2980 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 11808 | General/App State |
| syncImportedAnswerSummaryRow | 15504 | General/App State |
| syncLayoutForViewport | 3346 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 11695 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 15458 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 15259 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 9129 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 9461 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 10410 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 10541 | General/App State |
| syncWorkupConcernInputs | 10436 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 14911 | Workup Studio & Contribution |
| syncWorkupSelectors | 8153 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 5973 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 5533 | Workup Studio & Contribution |
| taskDescription | 4164 | General/App State |
| taskHasPasteBack | 14292 | General/App State |
| taskIsPlainEvidenceReview | 14296 | Evidence & Physical Exam |
| taskLabel | 4160 | Lab Timeline |
| titleCaseComponent | 12828 | General/App State |
| titleFromId | 1350 | General/App State |
| todayBaselinePatchFromElements | 10532 | General/App State |
| todayDateKey | 10443 | General/App State |
| todayInputsFromElements | 10504 | General/App State |
| todayPromptTaskId | 10569 | General/App State |
| todaySourceContext | 10554 | General/App State |
| todayWorkflowMode | 10477 | General/App State |
| toggleChecklistAnswer | 13135 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4080 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3298 | Workup Studio & Contribution |
| toggleWorkupStudioPanel | 7845 | Workup Studio & Contribution |
| trimCompactQrRow | 16187 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 11843 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 12742 | General/App State |
| uniqueChecklistOptions | 12719 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 9319 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 11864 | General/App State |
| unlockVault | 3542 | De-identification & Vault |
| updateBedsideCaseTitles | 13605 | Evidence & Physical Exam |
| updateChecklistAnswer | 13052 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 13909 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 6969 | General/App State |
| updateOpenEvidenceChangePreview | 15300 | Evidence & Physical Exam |
| updatePatient | 3881 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 8694 | Patient Roster / Admission |
| updateServiceCustomField | 2964 | General/App State |
| updateServiceSettingsPreview | 3001 | General/App State |
| updateWorkupSearchOnly | 8159 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 6227 | Workup Studio & Contribution |
| validateContributionInput | 7568 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 7659 | Workup Studio & Contribution |
| validPublicCatalogSnapshot | 4924 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 2560 | De-identification & Vault |
| vaultPayload | 3222 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 6243 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 10418 | Evidence & Physical Exam |
| visibleChecklistEntries | 13364 | Checklist / Complaint CDS / Clinical Intent |
| withZxingFallbackStop | 17468 | General/App State |
| workupCatalogSupabaseRequest | 4808 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 11838 | Workup Studio & Contribution |
| workupExamRows | 8814 | Workup Studio & Contribution |
| workupItemSearchText | 8498 | Workup Studio & Contribution |
| workupItemsForRow | 8792 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3288 | Workup Studio & Contribution |
| workupMatchBadge | 7873 | Workup Studio & Contribution |
| workupPickerGroups | 7915 | Workup Studio & Contribution |
| workupSearchTokens | 4396 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 4687 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 4572 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 4564 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 4576 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 4584 | Workup Studio & Contribution |
| workupStudioCanReview | 4580 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 6025 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 5494 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 6697 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 6175 | Workup Studio & Contribution |
| workupStudioItemSearchText | 6841 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 5498 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 4695 | Workup Studio & Contribution |
| workupStudioModuleMatches | 5512 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 6726 | Workup Studio & Contribution |
| workupStudioNodeRationale | 6055 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 6059 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 6031 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 6044 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 4712 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 5854 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 5650 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 5592 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 5956 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 5602 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 6197 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 5962 | Workup Studio & Contribution |
| workupStudioSectionIcon | 6613 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 5619 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 5850 | Workup Studio & Contribution |
| workupStudioSectionMeta | 6646 | Workup Studio & Contribution |
| workupStudioSectionMetric | 6638 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 6063 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 5750 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 5733 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 5782 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 5718 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 4766 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 4780 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 6713 | Workup Studio & Contribution |
| writePublicWorkupCatalogCache | 4933 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 17265 | Lab Timeline |
| zxingResultText | 17348 | General/App State |
