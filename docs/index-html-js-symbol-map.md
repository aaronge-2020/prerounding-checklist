# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1765-24466`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 988 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _collectPathwayPositionsFromChangeSets | 5036 | Clinical Pathway Graph |
| _flushWorkupStudioState | 5073 | Workup Studio & Contribution |
| _loadDeidModel | 2103 | De-identification & Vault |
| _loadWorkupStudioPathwayPositions | 5064 | Workup Studio & Contribution |
| _restorePathwayLayoutsToGraph | 5020 | Clinical Pathway Graph |
| _saveWorkupStudioPathwayPositions | 5056 | Workup Studio & Contribution |
| _stripPathwayLayoutsFromGraph | 5003 | Clinical Pathway Graph |
| $ | 2436 | General/App State |
| $$ | 2437 | General/App State |
| acceptWorkupStudioImport | 9235 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 18820 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 17257 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4651 | Patient Roster / Admission |
| addDecisionTreeChild | 12717 | General/App State |
| addDecisionTreeSibling | 12737 | General/App State |
| addItemSourceIds | 17280 | General/App State |
| addPatientChecklistItemFromEditor | 13267 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 17265 | General/App State |
| addUniqueWorkupStudioSourceToken | 6483 | Workup Studio & Contribution |
| addWorkupStudioItem | 8389 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 8183 | Workup Studio & Contribution |
| admitPatientFromForm | 4334 | Patient Roster / Admission |
| allChecklistEntries | 17192 | Checklist / Complaint CDS / Clinical Intent |
| annotateDecisionTreeStates | 11062 | General/App State |
| answeredChecklistCount | 17073 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 16581 | General/App State |
| answerTone | 17083 | General/App State |
| answerToneForOption | 17094 | General/App State |
| answerValueList | 16903 | General/App State |
| answerValueSelected | 17008 | General/App State |
| appendWorkupGroup | 4970 | Workup Studio & Contribution |
| appendWorkupOption | 4963 | Workup Studio & Contribution |
| applicabilityIssueForModule | 15318 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5583 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 19810 | Checklist / Complaint CDS / Clinical Intent |
| applyDecisionTreeJson | 12789 | General/App State |
| applyDeidResult | 15027 | De-identification & Vault |
| applyInitialRouteState | 24408 | General/App State |
| applyLayoutPreferences | 3733 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 13729 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 20564 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 18561 | General/App State |
| applyServiceFields | 3458 | Service Preferences & Picker |
| applyStreamCameraHints | 21356 | General/App State |
| applyStructuredRefinementText | 19777 | General/App State |
| applyStructuredRefinementToSections | 16265 | General/App State |
| applySupabaseWorkupCatalog | 5538 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 14603 | Evidence & Physical Exam |
| applyVaultPayload | 3632 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3774 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3856 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 7419 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5762 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5774 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 21345 | General/App State |
| approveLatestWorkupStudioChangeSet | 7689 | Workup Studio & Contribution |
| asArray | 15680 | General/App State |
| assertChecklistAnswerState | 16909 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingBundleCode | 19968 | General/App State |
| assertMatchingChecklistFingerprint | 21931 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 21914 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 3053 | General/App State |
| baseChecklistOptionsForItem | 16601 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1780 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4668 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 23391 | General/App State |
| bindServicePicker | 3349 | Service Preferences & Picker |
| bitsetBytesForIndexes | 22490 | General/App State |
| broadEndorsementQuestion | 16863 | General/App State |
| buildPatientChecklistInWorkspace | 16558 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 21867 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 14439 | General/App State |
| buildWorkupStudioSourcePrompt | 6441 | Workup Studio & Contribution |
| bytesToBase64 | 3047 | General/App State |
| cameraTrackEnhancementConstraints | 21333 | General/App State |
| captureWorkupStudioAuthRedirectError | 5845 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5980 | Supabase & Auth |
| checklistAnswerMetadataForItem | 16636 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 18211 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 22302 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 22315 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 17181 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 10219 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 22296 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 17234 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 17212 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 10228 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 22478 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 22482 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4753 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4746 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 13860 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 22288 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 22486 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 16589 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4735 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 17135 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 16978 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 20252 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 16703 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 18189 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 17101 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 17058 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 17241 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 17122 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 16585 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 17018 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 24339 | General/App State |
| chunkPhoneQrToken | 20900 | QR / Phone Handoff |
| clampLayoutSize | 3718 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 14535 | General/App State |
| cleanEndorsementComponent | 16774 | General/App State |
| cleanPhoneQrUrl | 21218 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 6293 | Workup Studio & Contribution |
| clearActiveChecklistSection | 17605 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 17623 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 9654 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 9666 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 19613 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 13081 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 21255 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 21704 | QR / Phone Handoff |
| clearStalePhonePayload | 20001 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5608 | Workup Studio & Contribution |
| clearWorkupStudioAuthSession | 5411 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 6793 | Workup Studio & Contribution |
| clinicalIntentModifierText | 15237 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 9394 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 15226 | General/App State |
| clinicalPathwayShortEdgeLabel | 10595 | Lab Timeline |
| cloneJson | 4655 | General/App State |
| clonePatient | 3021 | Patient Roster / Admission |
| closeAdmissionOverlay | 4299 | Patient Roster / Admission |
| closeAllServicePickers | 3273 | Service Preferences & Picker |
| closeDecisionTreeEditor | 12657 | General/App State |
| closeDischargeConfirmation | 4365 | Notes / H&P / Discharge |
| closePhiOverlay | 23122 | General/App State |
| closePhoneReturnQr | 22893 | QR / Phone Handoff |
| closeQuickDeid | 15193 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 4381 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 3262 | Service Preferences & Picker |
| closeServiceSettings | 3487 | General/App State |
| closestReviewedModules | 9312 | Checklist / Complaint CDS / Clinical Intent |
| coercePatientTabForDevice | 9727 | Patient Roster / Admission |
| collectPhoneQrChunk | 21629 | QR / Phone Handoff |
| collectQrChunk | 21606 | QR / Phone Handoff |
| collectReturnQrChunk | 21635 | QR / Phone Handoff |
| commitChecklistAnswer | 16926 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 19418 | QR / Phone Handoff |
| compactAnswerComponent | 22327 | General/App State |
| compactAnswerKeyParts | 22283 | General/App State |
| compactAnswerMenuItem | 17004 | General/App State |
| compactChecklistAnswerBitsetPayload | 22509 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 20237 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 22360 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 22420 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 20224 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 21838 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 22541 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 22396 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 22456 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 20269 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 20295 | Checklist / Complaint CDS / Clinical Intent |
| compactDecisionTreeNodeDetail | 11370 | General/App State |
| compactFieldId | 9909 | General/App State |
| compactManifestItemPatch | 20444 | General/App State |
| compactManifestSectionPatch | 20421 | General/App State |
| compactMenuViewport | 3814 | General/App State |
| compactPatientCanvasEdgeLabel | 11092 | Lab Timeline |
| compactPhoneHandoffDeltaPayloadForQr | 20651 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 20627 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 22602 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 22563 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 22581 | QR / Phone Handoff |
| compactReturnAnswerCount | 22705 | General/App State |
| compactReturnNoteCount | 22711 | Notes / H&P / Discharge |
| compactStringFingerprint | 21797 | Generic Utilities |
| compactStringFingerprint64 | 21807 | Generic Utilities |
| compactWorkupStudioPromptLine | 6185 | Workup Studio & Contribution |
| compareRuleValue | 11002 | General/App State |
| complaintModuleForSelectedIntents | 15266 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 17694 | General/App State |
| componentFromQuestionLabel | 16794 | Lab Timeline |
| componentsFromQuestionLabel | 16811 | Lab Timeline |
| conciseClinicalThresholdLabel | 10559 | Lab Timeline |
| confirmDischargePatient | 4424 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 19630 | QR / Phone Handoff |
| confirmRebuildChecklist | 4415 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 8906 | Workup Studio & Contribution |
| contributionDraftTriggers | 8923 | Workup Studio & Contribution |
| contributionDraftWorkupId | 8917 | Workup Studio & Contribution |
| contributionExamCatalog | 8976 | Workup Studio & Contribution |
| contributionPrompt | 8959 | Workup Studio & Contribution |
| copyContributionPrompt | 8963 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 13985 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 22169 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 21177 | QR / Phone Handoff |
| copyPhoneReturnPayload | 22270 | QR / Phone Handoff |
| copyText | 23127 | General/App State |
| copyTodayRoundsPrompt | 14588 | General/App State |
| countReviewPayloadItems | 7782 | General/App State |
| createNewWorkupFromAI | 9187 | Workup Studio & Contribution |
| createPatientFromAdmission | 4303 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 20175 | QR / Phone Handoff |
| createPhonePayload | 22113 | QR / Phone Handoff |
| createPhoneQrDeepLink | 20867 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 20851 | QR / Phone Handoff |
| createPhoneReturnPayload | 22265 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 22237 | QR / Phone Handoff |
| createPhoneReturnQrText | 22716 | QR / Phone Handoff |
| createVaultFromPassword | 4050 | De-identification & Vault |
| createWorkupStudioSourceDraft | 6726 | Workup Studio & Contribution |
| createZxingQrReader | 21300 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 21935 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 14359 | Continuity |
| currentContributionPromptOptions | 8942 | Workup Studio & Contribution |
| currentDecisionTreeGraph | 10939 | Clinical Pathway Graph |
| currentModuleEnvelopeWithDecisionTree | 12807 | Checklist / Complaint CDS / Clinical Intent |
| currentOpenEvidencePromptTemplate | 18496 | Evidence & Physical Exam |
| currentPhoneManifestHash | 21910 | QR / Phone Handoff |
| currentPhonePayload | 20016 | QR / Phone Handoff |
| currentPhoneTransferCode | 19977 | QR / Phone Handoff |
| currentRefinementInputText | 19822 | General/App State |
| currentRouteOrWorkspace | 3974 | General/App State |
| currentWorkupStudioPromptText | 7005 | Workup Studio & Contribution |
| cytoscapeStudioEdgeLabel | 11403 | Workup Studio & Contribution |
| cytoscapeStudioTreeElements | 11407 | Workup Studio & Contribution |
| cytoscapeStudioTreeNodePayload | 11378 | Workup Studio & Contribution |
| decisionRuleForNode | 10989 | General/App State |
| decisionTreeFileName | 12821 | General/App State |
| decisionTreeGraphEdgeLabel | 11324 | Lab Timeline |
| decisionTreeGraphNodeLabel | 11329 | Lab Timeline |
| decisionTreeImportSummary | 12575 | General/App State |
| decisionTreeNodeBounds | 11939 | General/App State |
| decisionTreeNodeBox | 11935 | General/App State |
| decisionTreeNodeDetailText | 11341 | General/App State |
| decisionTreeNodeRenderBox | 11914 | General/App State |
| decisionTreeNodes | 10528 | General/App State |
| decisionTreeOutlineDetailText | 11949 | General/App State |
| decisionTreeTraversalSummary | 11229 | General/App State |
| decodePayload | 19954 | General/App State |
| decodePhoneBundleInput | 21961 | QR / Phone Handoff |
| decodePhoneQrToken | 20763 | QR / Phone Handoff |
| decodePhoneReturnInput | 22954 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 22660 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 21424 | QR / Phone Handoff |
| decryptEncryptedPhonePayloadTransferText | 20074 | De-identification & Vault |
| decryptPhoneHandoffMailboxPayload | 20164 | De-identification & Vault |
| decryptVaultPayload | 3100 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 20382 | Workup Studio & Contribution |
| defaultDraftFor | 9784 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 20394 | Workup Studio & Contribution |
| deidentifyDailyInputs | 14379 | De-identification & Vault |
| deidentifyText | 2252 | De-identification & Vault |
| deleteSelectedDecisionTreeNode | 12760 | General/App State |
| deleteVault | 4269 | De-identification & Vault |
| demoCasePatient | 4132 | Patient Roster / Admission |
| derivedQrChecklistOptions | 20259 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 3064 | De-identification & Vault |
| dischargePatient | 4370 | Patient Roster / Admission |
| dkaDecisionTreeNodes | 10437 | General/App State |
| downloadDecisionTreeJson | 12825 | General/App State |
| downloadDecisionTreeModuleJson | 12829 | Checklist / Complaint CDS / Clinical Intent |
| downloadFile | 23144 | General/App State |
| duplicateWorkupStudioSectionItem | 8210 | Workup Studio & Contribution |
| editedImportedAnswerValue | 19397 | General/App State |
| effectiveClinicalIntentRegistry | 15246 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4696 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 15746 | General/App State |
| effectiveLocalWorkupModule | 4684 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4712 | General/App State |
| effectiveWorkupStudioModule | 6103 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 6325 | General/App State |
| emptyWorkupStudioBackendState | 5110 | Workup Studio & Contribution |
| encodePayload | 19947 | General/App State |
| encodePhoneQrToken | 20759 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 22633 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 20049 | De-identification & Vault |
| encryptedVaultRecord | 3110 | De-identification & Vault |
| encryptPhoneHandoffMailboxPayload | 20145 | De-identification & Vault |
| encryptVaultPayload | 3086 | De-identification & Vault |
| endorsementComponentsForItem | 16875 | General/App State |
| endorsementComponentsFromOptions | 16868 | General/App State |
| endorsementEntry | 16945 | General/App State |
| endorsementEntryStatus | 16949 | General/App State |
| endorsementStatusFor | 16955 | General/App State |
| ensureFindingsPhoneHandoffReady | 9737 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 13090 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 15060 | General/App State |
| ensureUniqueTreeId | 10540 | General/App State |
| ensureWorkup | 15828 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 5248 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5864 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 7196 | Workup Studio & Contribution |
| escapeHtml | 18301 | General/App State |
| escapeObjectiveRegex | 10000 | General/App State |
| evaluateEdgeLabel | 11042 | Lab Timeline |
| evaluateManualDecisionRule | 11020 | General/App State |
| evaluateUiComplaintCds | 15810 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 15735 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 19599 | General/App State |
| expandCompactAnswerComponent | 22343 | General/App State |
| expandCompactAnswerValueList | 22432 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 22525 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 20245 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 22374 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 22439 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 20231 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 22551 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 22407 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 22466 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 20317 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 20347 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 20692 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 22606 | QR / Phone Handoff |
| expandManifestItemPatch | 20458 | General/App State |
| expandManifestSectionPatch | 20431 | General/App State |
| explicitChecklistArray | 16622 | Checklist / Complaint CDS / Clinical Intent |
| exportWorkupStudioPatch | 9267 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 13539 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 16174 | General/App State |
| fallbackComplaintResult | 15765 | General/App State |
| fallbackGraphFromLinearNodes | 10903 | Clinical Pathway Graph |
| fallbackPatient | 3128 | Patient Roster / Admission |
| feverSepsisFallbackGraph | 10779 | Clinical Pathway Graph |
| fillPatientChecklistEditorFromEntry | 13020 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 14387 | General/App State |
| filterCurrentChecklistMap | 21945 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 13247 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 24304 | General/App State |
| findNamedViewRoute | 24333 | General/App State |
| findPatientChecklistPatchEntry | 13720 | Checklist / Complaint CDS / Clinical Intent |
| flattenDecisionTree | 10949 | General/App State |
| flushVaultSave | 3710 | De-identification & Vault |
| focusChecklistNote | 17467 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 17474 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 9290 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 9277 | Workup Studio & Contribution |
| formatAnswerValue | 17048 | Generic Utilities |
| formatCompletionSectionTitle | 17709 | Generic Utilities |
| formatRoundsReportAsText | 18831 | Generic Utilities |
| formatStudioOptionList | 8307 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 9078 | Workup Studio & Contribution |
| genericDecisionTreeNodes | 10499 | General/App State |
| genericObjectiveDataSpec | 9929 | General/App State |
| getOpenEvidencePromptText | 18622 | Evidence & Physical Exam |
| getSourceText | 14990 | General/App State |
| graphWithSelectedNodeUpdater | 12612 | Clinical Pathway Graph |
| guardWorkupCopyAction | 15601 | Workup Studio & Contribution |
| guidelineItemText | 10215 | General/App State |
| handleClearAllPrompts | 18592 | General/App State |
| handleConfirmPromptClick | 18604 | General/App State |
| handleMissingWorkupAction | 9451 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 21641 | QR / Phone Handoff |
| handleResizeKeydown | 3882 | General/App State |
| handleSavePromptTemplateClick | 18525 | General/App State |
| handleTogglePromptWorkbench | 18586 | General/App State |
| handleWorkupStudioAuthStateChange | 5828 | Workup Studio & Contribution |
| hasChecklistFinding | 17069 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 10433 | General/App State |
| hideNewWorkupDialog | 8901 | Workup Studio & Contribution |
| htmlToTemplate | 18310 | General/App State |
| hydrateIcons | 4614 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5725 | Workup Studio & Contribution |
| iconSvg | 4565 | General/App State |
| importAesGcmMailboxKey | 20135 | General/App State |
| importedAnswerSummaryRows | 19374 | General/App State |
| importPhoneFindings | 23090 | QR / Phone Handoff |
| importPhoneFindingsFromText | 23027 | QR / Phone Handoff |
| includedItems | 15756 | General/App State |
| indexesFromBitsetBytes | 22500 | General/App State |
| insertPromptVariable | 18446 | General/App State |
| installLayoutResizers | 3899 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 13235 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4660 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 16834 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4759 | Workup Studio & Contribution |
| isCompactPatientDevice | 9699 | Patient Roster / Admission |
| isDefaultServicePreferences | 3178 | Service Preferences & Picker |
| isDkaObjectiveModule | 9898 | Checklist / Complaint CDS / Clinical Intent |
| isInternalDecisionTreeNode | 11076 | General/App State |
| isLocallyMirroredHidden | 15271 | General/App State |
| isPhoneWorkflowDevice | 9703 | QR / Phone Handoff |
| isRoundsPasteBackTask | 18176 | General/App State |
| itemFindingText | 17062 | General/App State |
| itemNote | 17054 | Notes / H&P / Discharge |
| itemText | 15913 | General/App State |
| jsQrDecodeFromCanvas | 21411 | QR / Phone Handoff |
| jumpToPatientPanel | 14980 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 21890 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 6838 | Workup Studio & Contribution |
| listLocalDraftWorkups | 2432 | Workup Studio & Contribution |
| loadDemoCase | 4225 | General/App State |
| loadDesktopPhoneBundle | 22008 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 21196 | QR / Phone Handoff |
| loadLayoutPreferences | 3791 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 2412 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 21229 | QR / Phone Handoff |
| loadServicePreferences | 3213 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5660 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 6071 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 5421 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 6768 | Workup Studio & Contribution |
| loadWorkupStudioState | 5898 | Workup Studio & Contribution |
| localQrChunkFromText | 20802 | QR / Phone Handoff |
| localQrChunkText | 20798 | QR / Phone Handoff |
| localQrScannerAvailable | 21296 | Lab Timeline |
| localWorkupChangeSetsForModule | 4676 | Workup Studio & Contribution |
| lockVault | 4245 | De-identification & Vault |
| looksLikePhoneBundleText | 22981 | QR / Phone Handoff |
| manifestItemById | 20496 | General/App State |
| manifestSectionById | 20492 | General/App State |
| manifestSectionMeta | 20399 | General/App State |
| markAllOpenChecklistItemsReviewed | 17646 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 17664 | Checklist / Complaint CDS / Clinical Intent |
| markPathwayTreeReviewedForPublish | 7182 | Clinical Pathway Graph |
| markPatientDerivedArtifactsStale | 14925 | Patient Roster / Admission |
| matchingChecklistOption | 17131 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 6040 | Workup Studio & Contribution |
| minimalContributionContext | 8928 | Workup Studio & Contribution |
| missingObjectiveRows | 10099 | General/App State |
| mobileSectionTabLabel | 17501 | Lab Timeline |
| modifierOptions | 2068 | General/App State |
| moduleApplicabilityAsLimitation | 15432 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 15286 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 15275 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4720 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4994 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4978 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4731 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4950 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4788 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4834 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4850 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 4999 | Checklist / Complaint CDS / Clinical Intent |
| moveSelectedDecisionTreeNode | 12772 | General/App State |
| moveServicePickerActiveOption | 3326 | Service Preferences & Picker |
| multiSelectChecklistItem | 16983 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 21400 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 21381 | Lab Timeline |
| normalizedAnswerComponent | 16709 | General/App State |
| normalizedChecklistSearch | 17204 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 15222 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 17012 | General/App State |
| normalizedPatientChecklistEditOptions | 13179 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4876 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 13496 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 13521 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 13505 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 7220 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 13316 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 3148 | Service Preferences & Picker |
| normalizeState | 3517 | General/App State |
| normalizeSupabaseUrl | 5131 | Supabase & Auth |
| normalizeTransferCode | 19964 | General/App State |
| normalizeTreeChildren | 10552 | General/App State |
| normalizeWorkupStudioEmail | 5270 | Workup Studio & Contribution |
| numericObjectiveValue | 10035 | General/App State |
| objectiveDataContextText | 10126 | General/App State |
| objectiveDataRows | 10074 | General/App State |
| objectiveDataSpec | 9955 | General/App State |
| objectiveExtractedValueForField | 10018 | General/App State |
| objectiveFieldByLooseId | 10993 | General/App State |
| objectiveHintForField | 10040 | General/App State |
| objectiveNumber | 10429 | General/App State |
| objectiveRequiredRows | 10095 | General/App State |
| objectiveSearchText | 9974 | Generic Utilities |
| objectiveSourceForField | 10028 | General/App State |
| objectiveStatusLine | 10103 | General/App State |
| objectiveValueById | 10425 | General/App State |
| objectiveValueForField | 10022 | General/App State |
| openAdmissionOverlay | 4286 | Patient Roster / Admission |
| openDecisionTreeEditor | 12665 | General/App State |
| openEvidencePromptFields | 18490 | Evidence & Physical Exam |
| openEvidencePromptVariables | 18226 | Evidence & Physical Exam |
| openFinalFindingsReview | 22930 | General/App State |
| openImportedPhoneAnswerItem | 19430 | QR / Phone Handoff |
| openPhiOverlay | 23112 | General/App State |
| openPhoneChecklistPrimary | 14205 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 22907 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 22940 | QR / Phone Handoff |
| openQuickDeid | 15188 | De-identification & Vault |
| openRebuildChecklistConfirmation | 4385 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 3315 | Service Preferences & Picker |
| openServiceSettings | 3480 | General/App State |
| openVaultFromPassword | 4028 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 12922 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 9296 | Workup Studio & Contribution |
| optionDisplayLabel | 16732 | Lab Timeline |
| optionFromItemValue | 16616 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 16839 | General/App State |
| optionsFromPatchItem | 13656 | General/App State |
| parseClinicalPathwayGraph | 10774 | Clinical Pathway Graph |
| parsedObjectiveValue | 10004 | Generic Utilities |
| parsePatientChecklistEntryValue | 12970 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 13430 | Generic Utilities |
| parseStructuredWorkupRefinement | 16260 | Workup Studio & Contribution |
| parseStudioOptionList | 8295 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 7271 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 22214 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 23094 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 13373 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 3124 | Patient Roster / Admission |
| patientCanvasBranchState | 11109 | Patient Roster / Admission |
| patientChecklistEditConfig | 12933 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 12985 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 13199 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 13162 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 12966 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 13674 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 12962 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 13367 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 13872 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 13361 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 13356 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 13810 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 13404 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 13903 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 13824 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 13791 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 13880 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 13868 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 13898 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 13335 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 13321 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 13347 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 13557 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 14313 | Continuity |
| patientDecisionTreeCanvasGraph | 11140 | Clinical Pathway Graph |
| patientDraft | 9797 | Patient Roster / Admission |
| patientHasFollowUpContext | 9707 | Patient Roster / Admission |
| patientList | 3119 | Patient Roster / Admission |
| patientMatchesSearch | 14267 | Patient Roster / Admission |
| patientObjectiveRecord | 9961 | Patient Roster / Admission |
| patientPatchItemFields | 13644 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4797 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 9721 | Lab Timeline |
| patientWorkupPanelElement | 12608 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 7207 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 6050 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 21906 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 21885 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 20500 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 14066 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 20860 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 20086 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 20090 | QR / Phone Handoff |
| phoneHandoffMailboxLinkFromText | 20116 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 20207 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 20099 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 19981 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 19449 | QR / Phone Handoff |
| phoneImportSectionKey | 19442 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 20844 | QR / Phone Handoff |
| phonePayloadTransferText | 20024 | QR / Phone Handoff |
| phoneQrChunkFromText | 20817 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 20909 | QR / Phone Handoff |
| phoneQrStatusHint | 20998 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 20991 | QR / Phone Handoff |
| phoneQrSvgForLink | 20983 | QR / Phone Handoff |
| phoneQrTokenFromText | 20782 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 22698 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 22748 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 22774 | QR / Phone Handoff |
| phoneReturnTokenFromText | 22682 | QR / Phone Handoff |
| phoneTransferCryptoKey | 20030 | QR / Phone Handoff |
| plainObject | 19960 | General/App State |
| populatePatientWorkupSelect | 9561 | Workup Studio & Contribution |
| populateServiceSelect | 3224 | General/App State |
| populateWorkupStudioItemGroupSelect | 8262 | Workup Studio & Contribution |
| populateWorkupStudioSourceMetadataDefaults | 6378 | Workup Studio & Contribution |
| postgrestInFilter | 5629 | Generic Utilities |
| prepareGithubContribution | 9049 | Workup Studio & Contribution |
| preparePhoneHandoff | 22998 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 21367 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3978 | General/App State |
| primeChecklistWorkflow | 24351 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 18397 | General/App State |
| publicCatalogWorkupStatus | 7367 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 5147 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 9120 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 7451 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 7524 | Workup Studio & Contribution |
| qrModeForText | 20937 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 21308 | QR / Phone Handoff |
| qrSvgForSegments | 20941 | QR / Phone Handoff |
| qrSvgForText | 20963 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 20967 | QR / Phone Handoff |
| queryText | 24300 | General/App State |
| randomBase64 | 3058 | General/App State |
| randomCode | 19942 | General/App State |
| rawJsonObjectFromText | 10716 | General/App State |
| rawModuleById | 4672 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 14298 | Evidence & Physical Exam |
| readLocalDraftWorkups | 2390 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 5528 | Workup Studio & Contribution |
| readServiceFields | 3425 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 4400 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4793 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4766 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 14061 | General/App State |
| refinementSlug | 16170 | General/App State |
| refreshClinicalApplicabilityControls | 15585 | General/App State |
| refreshSupabaseWorkupCatalogForCurrentSession | 5746 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 7607 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 7017 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 13128 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 2425 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 13303 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 8242 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 17719 | Evidence & Physical Exam |
| renderCaseStatus | 19919 | General/App State |
| renderChecklist | 17831 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 17417 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 17527 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 9439 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 15516 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 8986 | Workup Studio & Contribution |
| renderCytoscapeStudioPathwayTree | 11469 | Workup Studio & Contribution |
| renderDecisionTreeEditor | 12621 | General/App State |
| renderDecisionTreeGraph | 12014 | Clinical Pathway Graph |
| renderDecisionTreeImportPreview | 12588 | General/App State |
| renderDecisionTreePanel | 12438 | General/App State |
| renderDecisionTreeReadableOutline | 11968 | General/App State |
| renderEvidenceReferenceCards | 17316 | Evidence & Physical Exam |
| renderFinalUpdate | 19911 | General/App State |
| renderGenericPasteBackPreview | 19029 | General/App State |
| renderHandoff | 23020 | General/App State |
| renderImportedPhoneAnswerSummary | 19465 | QR / Phone Handoff |
| renderModifierChips | 15613 | General/App State |
| renderObjectiveChips | 10162 | General/App State |
| renderObjectiveDataSurfaces | 12914 | General/App State |
| renderObjectiveEditor | 10179 | General/App State |
| renderObjectiveHeader | 10146 | General/App State |
| renderObjectiveReadOnlySurfaces | 12893 | General/App State |
| renderOverviewPasteBackResults | 18926 | General/App State |
| renderOverviewRoundsReport | 18859 | General/App State |
| renderPatientChecklistEditor | 13040 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 13608 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 14765 | Patient Roster / Admission |
| renderPatientRail | 14771 | Patient Roster / Admission |
| renderPatientRosterToggle | 4524 | Patient Roster / Admission |
| renderPatientTabs | 9766 | Patient Roster / Admission |
| renderPatientWorkspace | 14633 | Patient Roster / Admission |
| renderPatientWorkupResults | 9480 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 14164 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 14101 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 21024 | QR / Phone Handoff |
| renderPhoneQrCode | 21070 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 22781 | QR / Phone Handoff |
| renderPromptVariableBar | 18461 | General/App State |
| renderRoundsPasteBackPreview | 18987 | General/App State |
| renderSelectedWorkupCard | 9542 | Workup Studio & Contribution |
| renderServicePicker | 3279 | Service Preferences & Picker |
| renderServicePreferenceSummary | 3465 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 18773 | General/App State |
| renderStudioItemEditor | 8493 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 8714 | Workup Studio & Contribution |
| renderStudioPathwayEditor | 7952 | Workup Studio & Contribution |
| renderTodayCockpit | 14489 | General/App State |
| renderTodayReviewList | 14465 | General/App State |
| renderUnsupportedClinicalIntentResult | 9407 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 14005 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupDecisionSurfaces | 12886 | Workup Studio & Contribution |
| renderWorkupOrderResultSurfaces | 12871 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 10259 | Workup Studio & Contribution |
| renderWorkupRows | 15918 | Workup Studio & Contribution |
| renderWorkupRowsInto | 15934 | Workup Studio & Contribution |
| renderWorkupStudio | 8864 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 5167 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 8756 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 8799 | Workup Studio & Contribution |
| renderWorkupStudioList | 7715 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 7813 | Workup Studio & Contribution |
| renderWorkupStudioSourceDiff | 8778 | Workup Studio & Contribution |
| reorderById | 20552 | General/App State |
| repairOpenEvidencePatchCandidate | 13472 | Evidence & Physical Exam |
| replaceAllLiteral | 18243 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5595 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 18551 | Evidence & Physical Exam |
| resetNoSaveSession | 4100 | Supabase & Auth |
| resetPhoneQrChunkScanner | 21598 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 21602 | QR / Phone Handoff |
| resetWorkflowArtifacts | 3492 | General/App State |
| resetWorkupStudioPromptTemplate | 7009 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 18657 | Evidence & Physical Exam |
| resolvePromptTemplate | 18408 | General/App State |
| resolveUiComplaintModule | 15684 | Checklist / Complaint CDS / Clinical Intent |
| restoreState | 3687 | General/App State |
| reviewedSourceContextText | 14263 | General/App State |
| roundsPasteBackSummaryText | 18975 | General/App State |
| routeForNamedView | 24317 | General/App State |
| runQuickDeid | 15197 | De-identification & Vault |
| runWorkspaceContinuityDeid | 15133 | De-identification & Vault |
| runWorkspaceDeid | 15078 | De-identification & Vault |
| sameManifestItem | 20417 | General/App State |
| sameManifestSectionMeta | 20413 | General/App State |
| sameStringArray | 20409 | General/App State |
| sanitizeClinicalPathwayGraph | 10743 | Clinical Pathway Graph |
| sanitizeClinicalPathwayNode | 10623 | Clinical Pathway Graph |
| sanitizeRefinementItem | 16182 | General/App State |
| sanitizeStructuredWorkupRefinement | 16227 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 18535 | Evidence & Physical Exam |
| saveDecisionTreeGraph | 10961 | Clinical Pathway Graph |
| saveDecisionTreeNodeLayout | 10980 | Layout & Navigation Chrome |
| saveDecisionTreeToLocalWorkupFile | 12833 | Workup Studio & Contribution |
| saveGenericPasteBackForActivePatient | 19138 | Patient Roster / Admission |
| saveLayoutPreferences | 3725 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 2417 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 2400 | Workup Studio & Contribution |
| savePatientContinuityCase | 14338 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 19102 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 19063 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 13286 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 14973 | Patient Roster / Admission |
| saveServicePreferences | 3194 | Service Preferences & Picker |
| saveState | 3698 | General/App State |
| saveStructuredRefinement | 19748 | General/App State |
| saveTodayUpdate | 14551 | General/App State |
| saveWorkspaceContext | 14931 | General/App State |
| saveWorkspaceContinuity | 14946 | Continuity |
| saveWorkspaceFindings | 14958 | General/App State |
| saveWorkupStudioChangeSet | 7636 | Workup Studio & Contribution |
| saveWorkupStudioPathwayGraph | 7908 | Workup Studio & Contribution |
| saveWorkupStudioPathwayNodeLayout | 7920 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 6985 | Workup Studio & Contribution |
| saveWorkupStudioState | 5964 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5972 | Workup Studio & Contribution |
| scheduleDecisionTreeNodeUpdate | 12709 | General/App State |
| schedulePatientWorkupSearch | 9619 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 21261 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 21710 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 9608 | Workup Studio & Contribution |
| scrollChecklistEntry | 17519 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 9692 | Patient Roster / Admission |
| searchFieldParts | 4817 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 15495 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 16217 | General/App State |
| selectClinicalIntent | 15543 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 15294 | General/App State |
| selectedChecklistSourceIds | 17290 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 15254 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 15230 | General/App State |
| selectedDecisionTreeGraphForEdit | 12604 | Clinical Pathway Graph |
| selectedDecisionTreeNode | 10956 | General/App State |
| selectedKnowledgeModule | 15250 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 12981 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 14227 | Patient Roster / Admission |
| selectedStudioItem | 6167 | Workup Studio & Contribution |
| selectedTask | 18172 | General/App State |
| selectedWorkupApplicabilityIssue | 15415 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 6125 | Workup Studio & Contribution |
| selectedWorkupStudioPathwayEntry | 7871 | Workup Studio & Contribution |
| selectPatient | 14875 | Patient Roster / Admission |
| selectPatientWorkupModule | 9628 | Workup Studio & Contribution |
| selectServiceFromPicker | 3338 | General/App State |
| sendWorkupStudioMagicLink | 5296 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 3403 | Service Preferences & Picker |
| servicePickerForPrefix | 3237 | Service Preferences & Picker |
| servicePickerMatches | 3256 | Service Preferences & Picker |
| servicePickerOptions | 3322 | Service Preferences & Picker |
| servicePreferenceContextText | 3167 | Service Preferences & Picker |
| servicePreferenceLabel | 3160 | Lab Timeline |
| serviceProfileById | 3144 | Service Preferences & Picker |
| serviceProfileSearchText | 3247 | Service Preferences & Picker |
| serviceUserContext | 3185 | Service Preferences & Picker |
| setBedsideCompletionState | 17763 | Evidence & Physical Exam |
| setBedsideNoteValue | 14289 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 9679 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 16965 | General/App State |
| setFieldValueIfInactive | 14364 | General/App State |
| setHandoffStatus | 22000 | General/App State |
| setLayoutNavCollapsed | 3840 | Layout & Navigation Chrome |
| setLayoutSize | 3875 | Layout & Navigation Chrome |
| setObjectiveDataValue | 10134 | General/App State |
| setPatientChecklistEditStatus | 12989 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 13601 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4544 | Patient Roster / Admission |
| setPatientTab | 9744 | Patient Roster / Admission |
| setPatientWorkupPane | 4621 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 21988 | QR / Phone Handoff |
| setPhoneQrScannerActive | 21271 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 21251 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 22899 | QR / Phone Handoff |
| setPromptTemplateEditingState | 18505 | General/App State |
| setReturnQrScannerActive | 21720 | QR / Phone Handoff |
| setReturnQrScannerStatus | 21700 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4803 | Workup Studio & Contribution |
| setServiceFields | 3393 | Service Preferences & Picker |
| setSourceMode | 15022 | General/App State |
| setStatus | 3714 | General/App State |
| setTodayWorkflowMode | 14351 | General/App State |
| setupPromptEditorAutocomplete | 23156 | General/App State |
| setVaultStatus | 3040 | De-identification & Vault |
| setWorkupNavOpen | 3850 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3763 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3868 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 6305 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 6297 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 22184 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 24441 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 17636 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 22946 | Evidence & Physical Exam |
| showNewWorkupDialog | 8888 | Workup Studio & Contribution |
| showVaultAccess | 3933 | De-identification & Vault |
| showView | 4458 | General/App State |
| signOutWorkupStudioSupabase | 5824 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 15553 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 16844 | General/App State |
| slugId | 10532 | General/App State |
| snapshotChecklistResponseArtifacts | 13115 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4954 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5643 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 17309 | General/App State |
| splitChecklistOptions | 16593 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 21834 | General/App State |
| stableJsonValue | 21819 | General/App State |
| stableWorkupStudioItemId | 7296 | Workup Studio & Contribution |
| startFullFrameQrFallback | 21438 | QR / Phone Handoff |
| startManualQrScanner | 21506 | QR / Phone Handoff |
| startPhoneQrScanner | 21659 | QR / Phone Handoff |
| startReturnQrScanner | 21741 | QR / Phone Handoff |
| startRobustQrScanner | 21587 | QR / Phone Handoff |
| startSinglePatientWorkflow | 4125 | Patient Roster / Admission |
| startZxingQrScanner | 21547 | QR / Phone Handoff |
| stopPhoneQrCarousel | 21012 | QR / Phone Handoff |
| stopPhoneQrScanner | 21278 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 21018 | QR / Phone Handoff |
| stopReturnQrScanner | 21727 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 16292 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 13412 | General/App State |
| structuredRefinementSummary | 18754 | General/App State |
| studioDefaultItemType | 8331 | Workup Studio & Contribution |
| studioGeneratedItemId | 8342 | Workup Studio & Contribution |
| studioItemAnswerMode | 8322 | Workup Studio & Contribution |
| studioItemNormalAnswers | 8318 | Workup Studio & Contribution |
| studioItemOptions | 8311 | Workup Studio & Contribution |
| studioNewItemForSection | 8350 | Workup Studio & Contribution |
| studioPathwayGraphFromEditor | 7880 | Workup Studio & Contribution |
| studioSectionDefinition | 6148 | Workup Studio & Contribution |
| studioSectionItems | 6156 | Workup Studio & Contribution |
| studioSectionPayload | 6152 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 6173 | Workup Studio & Contribution |
| submitNewWorkupForReview | 9166 | Workup Studio & Contribution |
| supabaseAuthHeaders | 5333 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 6004 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 5460 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5654 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5741 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 5476 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5624 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5637 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 3451 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 15675 | General/App State |
| syncDecisionTreeHighlightToggle | 12880 | General/App State |
| syncImportedAnswerSummaryRow | 19405 | General/App State |
| syncLayoutForViewport | 3818 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 15562 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 19359 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 19155 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 12995 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 13327 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 14276 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 14407 | General/App State |
| syncWorkupConcernInputs | 14302 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 18800 | Workup Studio & Contribution |
| syncWorkupSelectors | 9585 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 6973 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 6132 | Workup Studio & Contribution |
| taskDescription | 4647 | General/App State |
| taskHasPasteBack | 18181 | General/App State |
| taskIsPlainEvidenceReview | 18185 | Evidence & Physical Exam |
| taskLabel | 4643 | Lab Timeline |
| titleCaseComponent | 16717 | General/App State |
| titleFromId | 4639 | General/App State |
| todayBaselinePatchFromElements | 14398 | General/App State |
| todayDateKey | 14309 | General/App State |
| todayInputsFromElements | 14370 | General/App State |
| todayPromptTaskId | 14435 | General/App State |
| todaySourceContext | 14420 | General/App State |
| todayWorkflowMode | 14343 | General/App State |
| toggleChecklistAnswer | 17024 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4556 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3770 | Workup Studio & Contribution |
| trimCompactQrRow | 20217 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 15710 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 16631 | General/App State |
| uniqueChecklistOptions | 16608 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 13185 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 15731 | General/App State |
| unlockVault | 4019 | De-identification & Vault |
| updateBedsideCaseTitles | 17494 | Evidence & Physical Exam |
| updateChecklistAnswer | 16941 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 17798 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 8402 | General/App State |
| updateOpenEvidenceChangePreview | 19196 | Evidence & Physical Exam |
| updatePatient | 4358 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 10113 | Patient Roster / Admission |
| updateSelectedDecisionTreeNodeFromInputs | 12683 | General/App State |
| updateServiceCustomField | 3435 | General/App State |
| updateServiceSettingsPreview | 3472 | General/App State |
| updateWorkupSearchOnly | 9591 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 7356 | Workup Studio & Contribution |
| validateContributionInput | 9021 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 9112 | Workup Studio & Contribution |
| validPublicCatalogSnapshot | 5503 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 3031 | De-identification & Vault |
| vaultPayload | 3693 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 7372 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 14284 | Evidence & Physical Exam |
| visibleChecklistEntries | 17253 | Checklist / Complaint CDS / Clinical Intent |
| visibleDecisionTreeChildren | 11084 | General/App State |
| visibleDecisionTreeFlatNodes | 11088 | General/App State |
| withZxingFallbackStop | 21495 | General/App State |
| workupCatalogSupabaseRequest | 5387 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 15705 | Workup Studio & Contribution |
| workupExamRows | 10233 | Workup Studio & Contribution |
| workupItemSearchText | 9917 | Workup Studio & Contribution |
| workupItemsForRow | 10211 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3759 | Workup Studio & Contribution |
| workupMatchBadge | 9305 | Workup Studio & Contribution |
| workupPickerGroups | 9347 | Workup Studio & Contribution |
| workupSearchTokens | 4884 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 5266 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 5151 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 5143 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 5155 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 5163 | Workup Studio & Contribution |
| workupStudioCanonicalSourceTerm | 6469 | Workup Studio & Contribution |
| workupStudioCanReview | 5159 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 7025 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 6093 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 8130 | Workup Studio & Contribution |
| workupStudioDraftGraphFromSourcePacket | 6679 | Workup Studio & Contribution |
| workupStudioFallbackDraftConcepts | 6608 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 7304 | Workup Studio & Contribution |
| workupStudioItemSearchText | 8274 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 6097 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 5274 | Workup Studio & Contribution |
| workupStudioModuleMatches | 6111 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 8159 | Workup Studio & Contribution |
| workupStudioNodeRationale | 7059 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 7063 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 7035 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 7048 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 5291 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 6854 | Workup Studio & Contribution |
| workupStudioPathwayBuilderPrompt | 6805 | Workup Studio & Contribution |
| workupStudioPathwayDiff | 7139 | Workup Studio & Contribution |
| workupStudioPathwayGraph | 7852 | Workup Studio & Contribution |
| workupStudioPathwayNodeLabel | 7031 | Workup Studio & Contribution |
| workupStudioPathwayNodeMap | 7135 | Workup Studio & Contribution |
| workupStudioPathwayNodeSignature | 7122 | Workup Studio & Contribution |
| workupStudioPathwayProvenanceAudit | 7067 | Workup Studio & Contribution |
| workupStudioPathwayPublishIssues | 7162 | Workup Studio & Contribution |
| workupStudioPathwaySchemaIssues | 7096 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 6249 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 6191 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 6956 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 6201 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 7326 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 6962 | Workup Studio & Contribution |
| workupStudioSectionIcon | 7766 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 6218 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 6850 | Workup Studio & Contribution |
| workupStudioSectionMeta | 7802 | Workup Studio & Contribution |
| workupStudioSectionMetric | 7791 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 7156 | Workup Studio & Contribution |
| workupStudioSourceBackedPathwayPrompt | 6399 | Workup Studio & Contribution |
| workupStudioSourceDraftConceptCatalog | 6519 | Workup Studio & Contribution |
| workupStudioSourceDraftConcepts | 6631 | Workup Studio & Contribution |
| workupStudioSourceDraftNode | 6646 | Workup Studio & Contribution |
| workupStudioSourceDraftNodeId | 6642 | Workup Studio & Contribution |
| workupStudioSourceEvidenceRecord | 6369 | Workup Studio & Contribution |
| workupStudioSourceFactTokens | 6491 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 6349 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 6332 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 6390 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 6317 | Workup Studio & Contribution |
| workupStudioSourceTokensForConcept | 6596 | Workup Studio & Contribution |
| workupStudioSourceUnsupportedNodes | 6666 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 5345 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 5359 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 8146 | Workup Studio & Contribution |
| wrapTreeText | 11299 | General/App State |
| writePublicWorkupCatalogCache | 5512 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 21292 | Lab Timeline |
| zxingResultText | 21375 | General/App State |
