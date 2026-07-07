# index.html Inline Script Symbol Map

Generated lookup table, not narrative docs. Regenerate after edits to the inline `<script type="module">` block (currently `index.html:1765-24352`) with:

```
node scripts/gen-index-html-symbol-map.js
```

## How to use this

1. Grep this file for the function/const name you need (`grep "functionName" docs/index-html-js-symbol-map.md`).
2. Read the `Line` column, then `Read index.html` with an offset near that line (e.g. offset = line - 5, limit = 80) instead of scanning the whole file.
3. Do **not** assume functions in the same feature area sit near each other in the file. They mostly don't — the inline script grew by appending new code near where it was easiest to paste, not by feature. The line range in AGENTS.md's feature-area summary table is the min/max span of matching functions, not a contiguous block. This table's per-function `Line` value is the only reliable coordinate.
4. "Feature area" is a heuristic tag assigned by name-keyword matching, not a verified functional grouping. Treat it as a hint, not ground truth.

Covers 977 top-level function/class/const-fn declarations found in the inline module script. Plain data constants (config objects/lists) are not included.

| Function | Line | Feature area |
|---|---|---|
| _collectPathwayPositionsFromChangeSets | 5037 | Clinical Pathway Graph |
| _flushWorkupStudioState | 5074 | Workup Studio & Contribution |
| _loadDeidModel | 2104 | De-identification & Vault |
| _loadWorkupStudioPathwayPositions | 5065 | Workup Studio & Contribution |
| _restorePathwayLayoutsToGraph | 5021 | Clinical Pathway Graph |
| _saveWorkupStudioPathwayPositions | 5057 | Workup Studio & Contribution |
| _stripPathwayLayoutsFromGraph | 5004 | Clinical Pathway Graph |
| $ | 2437 | General/App State |
| $$ | 2438 | General/App State |
| acceptWorkupStudioImport | 9236 | Workup Studio & Contribution |
| activeOpenEvidenceTasks | 18824 | Evidence & Physical Exam |
| activeOrFallbackChecklistEntry | 17261 | Checklist / Complaint CDS / Clinical Intent |
| activePatient | 4652 | Patient Roster / Admission |
| addDecisionTreeChild | 12722 | General/App State |
| addDecisionTreeSibling | 12742 | General/App State |
| addItemSourceIds | 17284 | General/App State |
| addPatientChecklistItemFromEditor | 13272 | Checklist / Complaint CDS / Clinical Intent |
| addSourceId | 17269 | General/App State |
| addUniqueWorkupStudioSourceToken | 6484 | Workup Studio & Contribution |
| addWorkupStudioItem | 8390 | Workup Studio & Contribution |
| addWorkupStudioSectionItem | 8184 | Workup Studio & Contribution |
| admitPatientFromForm | 4335 | Patient Roster / Admission |
| allChecklistEntries | 17196 | Checklist / Complaint CDS / Clinical Intent |
| annotateDecisionTreeStates | 11067 | General/App State |
| answeredChecklistCount | 17077 | Checklist / Complaint CDS / Clinical Intent |
| answerKey | 16585 | General/App State |
| answerTone | 17087 | General/App State |
| answerToneForOption | 17098 | General/App State |
| answerValueList | 16907 | General/App State |
| answerValueSelected | 17012 | General/App State |
| appendWorkupGroup | 4971 | Workup Studio & Contribution |
| appendWorkupOption | 4964 | Workup Studio & Contribution |
| applicabilityIssueForModule | 15322 | Checklist / Complaint CDS / Clinical Intent |
| applyCachedPublicWorkupCatalog | 5584 | Workup Studio & Contribution |
| applyChecklistReviewPasteBack | 19814 | Checklist / Complaint CDS / Clinical Intent |
| applyDecisionTreeJson | 12794 | General/App State |
| applyDeidResult | 15031 | De-identification & Vault |
| applyInitialRouteState | 24294 | General/App State |
| applyLayoutPreferences | 3734 | Layout & Navigation Chrome |
| applyPatientChecklistPatchText | 13734 | Checklist / Complaint CDS / Clinical Intent |
| applyPhoneChecklistManifestPatch | 20447 | Checklist / Complaint CDS / Clinical Intent |
| applyPromptWorkbenchCollapseState | 18565 | General/App State |
| applyServiceFields | 3459 | Service Preferences & Picker |
| applyStreamCameraHints | 21242 | General/App State |
| applyStructuredRefinementText | 19781 | General/App State |
| applyStructuredRefinementToSections | 16269 | General/App State |
| applySupabaseWorkupCatalog | 5539 | Workup Studio & Contribution |
| applyTodayOpenEvidencePasteBack | 14608 | Evidence & Physical Exam |
| applyVaultPayload | 3633 | De-identification & Vault |
| applyWorkupOrdersCollapseState | 3775 | Workup Studio & Contribution |
| applyWorkupStudioChromeState | 3857 | Workup Studio & Contribution |
| applyWorkupStudioPublicCatalogVerification | 7420 | Workup Studio & Contribution |
| applyWorkupStudioSession | 5763 | Workup Studio & Contribution |
| applyWorkupStudioSessionUnguarded | 5775 | Workup Studio & Contribution |
| applyZxingScannerCameraHints | 21231 | General/App State |
| approveLatestWorkupStudioChangeSet | 7690 | Workup Studio & Contribution |
| asArray | 15684 | General/App State |
| assertChecklistAnswerState | 16913 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingChecklistFingerprint | 21817 | Checklist / Complaint CDS / Clinical Intent |
| assertMatchingPhoneChecklistManifest | 21800 | Checklist / Complaint CDS / Clinical Intent |
| base64ToBytes | 3054 | General/App State |
| baseChecklistOptionsForItem | 16605 | Checklist / Complaint CDS / Clinical Intent |
| baseComplaintModulesById | 1781 | Checklist / Complaint CDS / Clinical Intent |
| baseModuleById | 4669 | Checklist / Complaint CDS / Clinical Intent |
| bindEvents | 23277 | General/App State |
| bindServicePicker | 3350 | Service Preferences & Picker |
| bitsetBytesForIndexes | 22376 | General/App State |
| broadEndorsementQuestion | 16867 | General/App State |
| buildPatientChecklistInWorkspace | 16562 | Checklist / Complaint CDS / Clinical Intent |
| buildPhoneChecklistManifest | 21753 | Checklist / Complaint CDS / Clinical Intent |
| buildTodayRoundsPrompt | 14444 | General/App State |
| buildWorkupStudioSourcePrompt | 6442 | Workup Studio & Contribution |
| bytesToBase64 | 3048 | General/App State |
| cameraTrackEnhancementConstraints | 21219 | General/App State |
| captureWorkupStudioAuthRedirectError | 5846 | Workup Studio & Contribution |
| changeSetToSupabaseRow | 5981 | Supabase & Auth |
| checklistAnswerMetadataForItem | 16640 | Checklist / Complaint CDS / Clinical Intent |
| checklistAuditSummaryText | 18215 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForIdentity | 22188 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForImportedRow | 22201 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForKey | 17185 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForLabel | 10224 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryForParts | 22182 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntryMatchesSearch | 17238 | Checklist / Complaint CDS / Clinical Intent |
| checklistEntrySearchText | 17216 | Checklist / Complaint CDS / Clinical Intent |
| checklistFindingForLabel | 10233 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatEntries | 22364 | Checklist / Complaint CDS / Clinical Intent |
| checklistFlatIndexForKey | 22368 | Checklist / Complaint CDS / Clinical Intent |
| checklistHasLocalBedsideWork | 4754 | Evidence & Physical Exam |
| checklistHasResponseArtifacts | 4747 | Checklist / Complaint CDS / Clinical Intent |
| checklistImprovementRefinementNotes | 13865 | Checklist / Complaint CDS / Clinical Intent |
| checklistItemIdentity | 22174 | Checklist / Complaint CDS / Clinical Intent |
| checklistKeyForFlatIndex | 22372 | Checklist / Complaint CDS / Clinical Intent |
| checklistKind | 16593 | Checklist / Complaint CDS / Clinical Intent |
| checklistModuleSignature | 4736 | Checklist / Complaint CDS / Clinical Intent |
| checklistNormalAnswersForItem | 17139 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionIsExclusive | 16982 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionListsEqual | 20135 | Checklist / Complaint CDS / Clinical Intent |
| checklistOptionsForItem | 16707 | Checklist / Complaint CDS / Clinical Intent |
| checklistPatientSummaryText | 18193 | Checklist / Complaint CDS / Clinical Intent |
| checklistPolarity | 17105 | Checklist / Complaint CDS / Clinical Intent |
| checklistReviewed | 17062 | Checklist / Complaint CDS / Clinical Intent |
| checklistRowPassesFilter | 17245 | Checklist / Complaint CDS / Clinical Intent |
| checklistStatusLabel | 17126 | Checklist / Complaint CDS / Clinical Intent |
| checklistTotalCount | 16589 | Checklist / Complaint CDS / Clinical Intent |
| checklistValuesConflict | 17022 | Checklist / Complaint CDS / Clinical Intent |
| chooseInitialRoute | 24225 | General/App State |
| chunkPhoneQrToken | 20786 | QR / Phone Handoff |
| clampLayoutSize | 3719 | Layout & Navigation Chrome |
| classifyTodaySmartPaste | 14540 | General/App State |
| cleanEndorsementComponent | 16778 | General/App State |
| cleanPhoneQrUrl | 21104 | QR / Phone Handoff |
| cleanWorkupStudioSourceValue | 6294 | Workup Studio & Contribution |
| clearActiveChecklistSection | 17609 | Checklist / Complaint CDS / Clinical Intent |
| clearAllChecklistAnswers | 17627 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistArtifacts | 9659 | Checklist / Complaint CDS / Clinical Intent |
| clearChecklistResponseArtifacts | 9671 | Checklist / Complaint CDS / Clinical Intent |
| clearImportedPhoneAnswers | 19617 | QR / Phone Handoff |
| clearPatientChecklistEditorDraft | 13086 | Checklist / Complaint CDS / Clinical Intent |
| clearPhoneQrScannerGuidanceTimer | 21141 | QR / Phone Handoff |
| clearReturnQrScannerGuidanceTimer | 21590 | QR / Phone Handoff |
| clearStalePhonePayload | 19974 | QR / Phone Handoff |
| clearSupabaseWorkupCatalog | 5609 | Workup Studio & Contribution |
| clearWorkupStudioAuthSession | 5412 | Workup Studio & Contribution |
| clearWorkupStudioSourceText | 6794 | Workup Studio & Contribution |
| clinicalIntentModifierText | 15241 | Checklist / Complaint CDS / Clinical Intent |
| clinicalIntentSelectionPrompt | 9395 | Checklist / Complaint CDS / Clinical Intent |
| clinicalModifierValue | 15230 | General/App State |
| clinicalPathwayShortEdgeLabel | 10600 | Lab Timeline |
| cloneJson | 4656 | General/App State |
| clonePatient | 3022 | Patient Roster / Admission |
| closeAdmissionOverlay | 4300 | Patient Roster / Admission |
| closeAllServicePickers | 3274 | Service Preferences & Picker |
| closeDecisionTreeEditor | 12662 | General/App State |
| closeDischargeConfirmation | 4366 | Notes / H&P / Discharge |
| closePhiOverlay | 23008 | General/App State |
| closePhoneReturnQr | 22779 | QR / Phone Handoff |
| closeQuickDeid | 15197 | De-identification & Vault |
| closeRebuildChecklistConfirmation | 4382 | Checklist / Complaint CDS / Clinical Intent |
| closeServicePicker | 3263 | Service Preferences & Picker |
| closeServiceSettings | 3488 | General/App State |
| closestReviewedModules | 9313 | Checklist / Complaint CDS / Clinical Intent |
| coercePatientTabForDevice | 9732 | Patient Roster / Admission |
| collectPhoneQrChunk | 21515 | QR / Phone Handoff |
| collectQrChunk | 21492 | QR / Phone Handoff |
| collectReturnQrChunk | 21521 | QR / Phone Handoff |
| commitChecklistAnswer | 16930 | Checklist / Complaint CDS / Clinical Intent |
| commitImportedPhoneAnswerEdit | 19422 | QR / Phone Handoff |
| compactAnswerComponent | 22213 | General/App State |
| compactAnswerKeyParts | 22169 | General/App State |
| compactAnswerMenuItem | 17008 | General/App State |
| compactChecklistAnswerBitsetPayload | 22395 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerMode | 20120 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRows | 22246 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistAnswerRowsV4 | 22306 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistCategory | 20107 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistItemForManifest | 21724 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteIndexRows | 22427 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRows | 22282 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistNoteRowsV4 | 22342 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr | 20152 | Checklist / Complaint CDS / Clinical Intent |
| compactChecklistSectionsForQr2 | 20178 | Checklist / Complaint CDS / Clinical Intent |
| compactDecisionTreeNodeDetail | 11375 | General/App State |
| compactFieldId | 9914 | General/App State |
| compactManifestItemPatch | 20327 | General/App State |
| compactManifestSectionPatch | 20304 | General/App State |
| compactMenuViewport | 3815 | General/App State |
| compactPatientCanvasEdgeLabel | 11097 | Lab Timeline |
| compactPhoneHandoffDeltaPayloadForQr | 20534 | QR / Phone Handoff |
| compactPhoneHandoffPayloadForQr | 20510 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQr | 22488 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV4 | 22449 | QR / Phone Handoff |
| compactPhoneReturnPayloadForQrV6 | 22467 | QR / Phone Handoff |
| compactReturnAnswerCount | 22591 | General/App State |
| compactReturnNoteCount | 22597 | Notes / H&P / Discharge |
| compactStringFingerprint | 21683 | Generic Utilities |
| compactStringFingerprint64 | 21693 | Generic Utilities |
| compactWorkupStudioPromptLine | 6186 | Workup Studio & Contribution |
| compareRuleValue | 11007 | General/App State |
| complaintModuleForSelectedIntents | 15270 | Checklist / Complaint CDS / Clinical Intent |
| completionSummaryIconForSection | 17698 | General/App State |
| componentFromQuestionLabel | 16798 | Lab Timeline |
| componentsFromQuestionLabel | 16815 | Lab Timeline |
| conciseClinicalThresholdLabel | 10564 | Lab Timeline |
| confirmDischargePatient | 4425 | Patient Roster / Admission |
| confirmImportedPhoneAnswers | 19634 | QR / Phone Handoff |
| confirmRebuildChecklist | 4416 | Checklist / Complaint CDS / Clinical Intent |
| contributionDraftTitle | 8907 | Workup Studio & Contribution |
| contributionDraftTriggers | 8924 | Workup Studio & Contribution |
| contributionDraftWorkupId | 8918 | Workup Studio & Contribution |
| contributionExamCatalog | 8977 | Workup Studio & Contribution |
| contributionPrompt | 8960 | Workup Studio & Contribution |
| copyContributionPrompt | 8964 | Workup Studio & Contribution |
| copyPatientChecklistPatchPrompt | 13990 | Checklist / Complaint CDS / Clinical Intent |
| copyPhonePayloadForTransfer | 22055 | QR / Phone Handoff |
| copyPhoneQrLinkForTransfer | 21063 | QR / Phone Handoff |
| copyPhoneReturnPayload | 22156 | QR / Phone Handoff |
| copyText | 23013 | General/App State |
| copyTodayRoundsPrompt | 14593 | General/App State |
| countReviewPayloadItems | 7783 | General/App State |
| createNewWorkupFromAI | 9188 | Workup Studio & Contribution |
| createPatientFromAdmission | 4304 | Patient Roster / Admission |
| createPhoneHandoffMailboxLink | 20058 | QR / Phone Handoff |
| createPhonePayload | 21999 | QR / Phone Handoff |
| createPhoneQrDeepLink | 20753 | QR / Phone Handoff |
| createPhoneQrMailboxDeepLink | 20734 | QR / Phone Handoff |
| createPhoneReturnPayload | 22151 | QR / Phone Handoff |
| createPhoneReturnPayloadObject | 22123 | QR / Phone Handoff |
| createPhoneReturnQrText | 22602 | QR / Phone Handoff |
| createVaultFromPassword | 4051 | De-identification & Vault |
| createWorkupStudioSourceDraft | 6727 | Workup Studio & Contribution |
| createZxingQrReader | 21186 | QR / Phone Handoff |
| currentChecklistAnswerKeySet | 21821 | Checklist / Complaint CDS / Clinical Intent |
| currentContinuityDay | 14364 | Continuity |
| currentContributionPromptOptions | 8943 | Workup Studio & Contribution |
| currentDecisionTreeGraph | 10944 | Clinical Pathway Graph |
| currentModuleEnvelopeWithDecisionTree | 12812 | Checklist / Complaint CDS / Clinical Intent |
| currentOpenEvidencePromptTemplate | 18500 | Evidence & Physical Exam |
| currentPhoneManifestHash | 21796 | QR / Phone Handoff |
| currentPhonePayload | 19989 | QR / Phone Handoff |
| currentPhoneTransferCode | 19950 | QR / Phone Handoff |
| currentRefinementInputText | 19826 | General/App State |
| currentRouteOrWorkspace | 3975 | General/App State |
| currentWorkupStudioPromptText | 7006 | Workup Studio & Contribution |
| cytoscapeStudioEdgeLabel | 11408 | Workup Studio & Contribution |
| cytoscapeStudioTreeElements | 11412 | Workup Studio & Contribution |
| cytoscapeStudioTreeNodePayload | 11383 | Workup Studio & Contribution |
| decisionRuleForNode | 10994 | General/App State |
| decisionTreeFileName | 12826 | General/App State |
| decisionTreeGraphEdgeLabel | 11329 | Lab Timeline |
| decisionTreeGraphNodeLabel | 11334 | Lab Timeline |
| decisionTreeImportSummary | 12580 | General/App State |
| decisionTreeNodeBounds | 11944 | General/App State |
| decisionTreeNodeBox | 11940 | General/App State |
| decisionTreeNodeDetailText | 11346 | General/App State |
| decisionTreeNodeRenderBox | 11919 | General/App State |
| decisionTreeNodes | 10533 | General/App State |
| decisionTreeOutlineDetailText | 11954 | General/App State |
| decisionTreeTraversalSummary | 11234 | General/App State |
| decodePhoneBundleInput | 21847 | QR / Phone Handoff |
| decodePhoneQrToken | 20646 | QR / Phone Handoff |
| decodePhoneReturnInput | 22840 | QR / Phone Handoff |
| decodePhoneReturnQrToken | 22546 | QR / Phone Handoff |
| decodeQrTextFromCanvas | 21310 | QR / Phone Handoff |
| decryptVaultPayload | 3101 | De-identification & Vault |
| defaultChecklistSectionsForWorkupModule | 20265 | Workup Studio & Contribution |
| defaultDraftFor | 9789 | General/App State |
| defaultPhoneChecklistManifestForWorkup | 20277 | Workup Studio & Contribution |
| deidentifyDailyInputs | 14384 | De-identification & Vault |
| deidentifyText | 2253 | De-identification & Vault |
| deleteSelectedDecisionTreeNode | 12765 | General/App State |
| deleteVault | 4270 | De-identification & Vault |
| demoCasePatient | 4133 | Patient Roster / Admission |
| derivedQrChecklistOptions | 20142 | Checklist / Complaint CDS / Clinical Intent |
| deriveVaultKey | 3065 | De-identification & Vault |
| dischargePatient | 4371 | Patient Roster / Admission |
| dkaDecisionTreeNodes | 10442 | General/App State |
| downloadDecisionTreeJson | 12830 | General/App State |
| downloadDecisionTreeModuleJson | 12834 | Checklist / Complaint CDS / Clinical Intent |
| downloadFile | 23030 | General/App State |
| duplicateWorkupStudioSectionItem | 8211 | Workup Studio & Contribution |
| editedImportedAnswerValue | 19401 | General/App State |
| effectiveClinicalIntentRegistry | 15250 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintModules | 4697 | Checklist / Complaint CDS / Clinical Intent |
| effectiveComplaintSourceRegistry | 15750 | General/App State |
| effectiveLocalWorkupModule | 4685 | Workup Studio & Contribution |
| effectiveSourceRegistry | 4713 | General/App State |
| effectiveWorkupStudioModule | 6104 | Workup Studio & Contribution |
| elapsedMsBetweenIsoDates | 6326 | General/App State |
| emptyWorkupStudioBackendState | 5111 | Workup Studio & Contribution |
| encodePhoneQrToken | 20642 | QR / Phone Handoff |
| encodePhoneReturnQrToken | 22519 | QR / Phone Handoff |
| encryptedPhonePayloadTransferText | 20003 | De-identification & Vault |
| encryptedVaultRecord | 3111 | De-identification & Vault |
| encryptVaultPayload | 3087 | De-identification & Vault |
| endorsementComponentsForItem | 16879 | General/App State |
| endorsementComponentsFromOptions | 16872 | General/App State |
| endorsementEntry | 16949 | General/App State |
| endorsementEntryStatus | 16953 | General/App State |
| endorsementStatusFor | 16959 | General/App State |
| ensureFindingsPhoneHandoffReady | 9742 | QR / Phone Handoff |
| ensurePatientChecklistItemIds | 13095 | Checklist / Complaint CDS / Clinical Intent |
| ensureRedactedContext | 15064 | General/App State |
| ensureUniqueTreeId | 10545 | General/App State |
| ensureWorkup | 15832 | Workup Studio & Contribution |
| ensureWorkupStudioBackendConfig | 5249 | Workup Studio & Contribution |
| ensureWorkupStudioBackendSession | 5865 | Workup Studio & Contribution |
| ensureWorkupStudioResultScope | 7197 | Workup Studio & Contribution |
| escapeHtml | 18305 | General/App State |
| escapeObjectiveRegex | 10005 | General/App State |
| evaluateEdgeLabel | 11047 | Lab Timeline |
| evaluateManualDecisionRule | 11025 | General/App State |
| evaluateUiComplaintCds | 15814 | Checklist / Complaint CDS / Clinical Intent |
| evidenceSourceRowAsComplaintSource | 15739 | Evidence & Physical Exam |
| expandAllImportedAnswerGroups | 19603 | General/App State |
| expandCompactAnswerComponent | 22229 | General/App State |
| expandCompactAnswerValueList | 22318 | General/App State |
| expandCompactChecklistAnswerBitsetPayload | 22411 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerMode | 20128 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRows | 22260 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistAnswerRowsV4 | 22325 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistCategory | 20114 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteIndexRows | 22437 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRows | 22293 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistNoteRowsV4 | 22352 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr | 20200 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactChecklistSectionsForQr2 | 20230 | Checklist / Complaint CDS / Clinical Intent |
| expandCompactPhoneHandoffPayloadForQr | 20575 | QR / Phone Handoff |
| expandCompactPhoneReturnPayloadForQr | 22492 | QR / Phone Handoff |
| expandManifestItemPatch | 20341 | General/App State |
| expandManifestSectionPatch | 20314 | General/App State |
| explicitChecklistArray | 16626 | Checklist / Complaint CDS / Clinical Intent |
| exportWorkupStudioPatch | 9268 | Workup Studio & Contribution |
| extractPatientChecklistPatchJson | 13544 | Checklist / Complaint CDS / Clinical Intent |
| extractStructuredRefinementJson | 16178 | General/App State |
| fallbackComplaintResult | 15769 | General/App State |
| fallbackGraphFromLinearNodes | 10908 | Clinical Pathway Graph |
| fallbackPatient | 3129 | Patient Roster / Admission |
| feverSepsisFallbackGraph | 10784 | Clinical Pathway Graph |
| fillPatientChecklistEditorFromEntry | 13025 | Checklist / Complaint CDS / Clinical Intent |
| fillTodayInputFields | 14392 | General/App State |
| filterCurrentChecklistMap | 21831 | Checklist / Complaint CDS / Clinical Intent |
| finalizePatientChecklistEdit | 13252 | Checklist / Complaint CDS / Clinical Intent |
| findDesktopPanelRoute | 24190 | General/App State |
| findNamedViewRoute | 24219 | General/App State |
| findPatientChecklistPatchEntry | 13725 | Checklist / Complaint CDS / Clinical Intent |
| flattenDecisionTree | 10954 | General/App State |
| flushVaultSave | 3711 | De-identification & Vault |
| focusChecklistNote | 17471 | Checklist / Complaint CDS / Clinical Intent |
| focusNextUnansweredChecklistItem | 17478 | Checklist / Complaint CDS / Clinical Intent |
| focusWorkupStudioImport | 9291 | Workup Studio & Contribution |
| focusWorkupStudioSettings | 9278 | Workup Studio & Contribution |
| formatAnswerValue | 17052 | Generic Utilities |
| formatCompletionSectionTitle | 17713 | Generic Utilities |
| formatRoundsReportAsText | 18835 | Generic Utilities |
| formatStudioOptionList | 8308 | Workup Studio & Contribution |
| generateNewWorkupAIPrompt | 9079 | Workup Studio & Contribution |
| genericDecisionTreeNodes | 10504 | General/App State |
| genericObjectiveDataSpec | 9934 | General/App State |
| getOpenEvidencePromptText | 18626 | Evidence & Physical Exam |
| getSourceText | 14994 | General/App State |
| graphWithSelectedNodeUpdater | 12617 | Clinical Pathway Graph |
| guardWorkupCopyAction | 15605 | Workup Studio & Contribution |
| guidelineItemText | 10220 | General/App State |
| handleClearAllPrompts | 18596 | General/App State |
| handleConfirmPromptClick | 18608 | General/App State |
| handleMissingWorkupAction | 9452 | Workup Studio & Contribution |
| handlePhoneQrScannerDecodedText | 21527 | QR / Phone Handoff |
| handleResizeKeydown | 3883 | General/App State |
| handleSavePromptTemplateClick | 18529 | General/App State |
| handleTogglePromptWorkbench | 18590 | General/App State |
| handleWorkupStudioAuthStateChange | 5829 | Workup Studio & Contribution |
| hasChecklistFinding | 17073 | Checklist / Complaint CDS / Clinical Intent |
| hasObjectiveValue | 10438 | General/App State |
| hideNewWorkupDialog | 8902 | Workup Studio & Contribution |
| htmlToTemplate | 18314 | General/App State |
| hydrateIcons | 4615 | General/App State |
| hydratePublicWorkupCatalogOnStartup | 5726 | Workup Studio & Contribution |
| iconSvg | 4566 | General/App State |
| importedAnswerSummaryRows | 19378 | General/App State |
| importPhoneFindings | 22976 | QR / Phone Handoff |
| importPhoneFindingsFromText | 22913 | QR / Phone Handoff |
| includedItems | 15760 | General/App State |
| indexesFromBitsetBytes | 22386 | General/App State |
| insertPromptVariable | 18450 | General/App State |
| installLayoutResizers | 3900 | Layout & Navigation Chrome |
| invalidatePhonePayloadAfterChecklistEdit | 13240 | Checklist / Complaint CDS / Clinical Intent |
| invalidateWorkupModuleCaches | 4661 | Workup Studio & Contribution |
| isCategoricalChecklistQuestion | 16838 | Checklist / Complaint CDS / Clinical Intent |
| isChecklistStaleForCurrentWorkup | 4760 | Workup Studio & Contribution |
| isCompactPatientDevice | 9704 | Patient Roster / Admission |
| isDefaultServicePreferences | 3179 | Service Preferences & Picker |
| isDkaObjectiveModule | 9903 | Checklist / Complaint CDS / Clinical Intent |
| isInternalDecisionTreeNode | 11081 | General/App State |
| isLocallyMirroredHidden | 15275 | General/App State |
| isPhoneWorkflowDevice | 9708 | QR / Phone Handoff |
| isRoundsPasteBackTask | 18180 | General/App State |
| itemFindingText | 17066 | General/App State |
| itemNote | 17058 | Notes / H&P / Discharge |
| itemText | 15917 | General/App State |
| jsQrDecodeFromCanvas | 21297 | QR / Phone Handoff |
| jumpToPatientPanel | 14984 | Patient Roster / Admission |
| legacyPhoneChecklistFingerprint | 21776 | Checklist / Complaint CDS / Clinical Intent |
| legacyWorkupStudioPromptTemplate | 6839 | Workup Studio & Contribution |
| listLocalDraftWorkups | 2433 | Workup Studio & Contribution |
| loadDemoCase | 4226 | General/App State |
| loadDesktopPhoneBundle | 21894 | QR / Phone Handoff |
| loadDesktopPhoneBundleFromAnyText | 21082 | QR / Phone Handoff |
| loadLayoutPreferences | 3792 | Layout & Navigation Chrome |
| loadLocalDraftWorkupsOnStartup | 2413 | Workup Studio & Contribution |
| loadPhoneQrDeepLinkFromLocation | 21115 | QR / Phone Handoff |
| loadServicePreferences | 3214 | Service Preferences & Picker |
| loadSupabaseWorkupCatalog | 5661 | Workup Studio & Contribution |
| loadWorkupStudioBackendChangeSets | 6072 | Workup Studio & Contribution |
| loadWorkupStudioPermissions | 5422 | Workup Studio & Contribution |
| loadWorkupStudioSourceFile | 6769 | Workup Studio & Contribution |
| loadWorkupStudioState | 5899 | Workup Studio & Contribution |
| localQrChunkFromText | 20685 | QR / Phone Handoff |
| localQrChunkText | 20681 | QR / Phone Handoff |
| localQrScannerAvailable | 21182 | Lab Timeline |
| localWorkupChangeSetsForModule | 4677 | Workup Studio & Contribution |
| lockVault | 4246 | De-identification & Vault |
| looksLikePhoneBundleText | 22867 | QR / Phone Handoff |
| manifestItemById | 20379 | General/App State |
| manifestSectionById | 20375 | General/App State |
| manifestSectionMeta | 20282 | General/App State |
| markAllOpenChecklistItemsReviewed | 17650 | Checklist / Complaint CDS / Clinical Intent |
| markChecklistSectionNormal | 17668 | Checklist / Complaint CDS / Clinical Intent |
| markPathwayTreeReviewedForPublish | 7183 | Clinical Pathway Graph |
| markPatientDerivedArtifactsStale | 14929 | Patient Roster / Admission |
| matchingChecklistOption | 17135 | Checklist / Complaint CDS / Clinical Intent |
| mergeWorkupStudioChangeSets | 6041 | Workup Studio & Contribution |
| minimalContributionContext | 8929 | Workup Studio & Contribution |
| missingObjectiveRows | 10104 | General/App State |
| mobileSectionTabLabel | 17505 | Lab Timeline |
| modifierOptions | 2069 | General/App State |
| moduleApplicabilityAsLimitation | 15436 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilityChipLabel | 15290 | Checklist / Complaint CDS / Clinical Intent |
| moduleApplicabilitySummary | 15279 | Checklist / Complaint CDS / Clinical Intent |
| moduleById | 4721 | Checklist / Complaint CDS / Clinical Intent |
| moduleDescription | 4995 | Checklist / Complaint CDS / Clinical Intent |
| moduleItemCount | 4979 | Checklist / Complaint CDS / Clinical Intent |
| moduleLabel | 4732 | Checklist / Complaint CDS / Clinical Intent |
| moduleMatchesSearch | 4951 | Checklist / Complaint CDS / Clinical Intent |
| modulePopulationLabel | 4789 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchSynonymText | 4835 | Checklist / Complaint CDS / Clinical Intent |
| moduleSearchText | 4851 | Checklist / Complaint CDS / Clinical Intent |
| moduleVersionLabel | 5000 | Checklist / Complaint CDS / Clinical Intent |
| moveSelectedDecisionTreeNode | 12777 | General/App State |
| moveServicePickerActiveOption | 3327 | Service Preferences & Picker |
| multiSelectChecklistItem | 16987 | Checklist / Complaint CDS / Clinical Intent |
| nativeQrDecodeFromCanvas | 21286 | QR / Phone Handoff |
| nativeQrDetectorAvailable | 21267 | Lab Timeline |
| normalizedAnswerComponent | 16713 | General/App State |
| normalizedChecklistSearch | 17208 | Checklist / Complaint CDS / Clinical Intent |
| normalizedExamText | 15226 | Evidence & Physical Exam |
| normalizedExclusiveGroups | 17016 | General/App State |
| normalizedPatientChecklistEditOptions | 13184 | Checklist / Complaint CDS / Clinical Intent |
| normalizedWorkupQuery | 4877 | Workup Studio & Contribution |
| normalizeOpenEvidencePatchKey | 13501 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchObject | 13526 | Evidence & Physical Exam |
| normalizeOpenEvidencePatchValue | 13510 | Evidence & Physical Exam |
| normalizeOpenEvidenceSectionPayload | 7221 | Evidence & Physical Exam |
| normalizePatientChecklistPatchSectionKey | 13321 | Checklist / Complaint CDS / Clinical Intent |
| normalizeServicePreferences | 3149 | Service Preferences & Picker |
| normalizeState | 3518 | General/App State |
| normalizeSupabaseUrl | 5132 | Supabase & Auth |
| normalizeTreeChildren | 10557 | General/App State |
| normalizeWorkupStudioEmail | 5271 | Workup Studio & Contribution |
| numericObjectiveValue | 10040 | General/App State |
| objectiveDataContextText | 10131 | General/App State |
| objectiveDataRows | 10079 | General/App State |
| objectiveDataSpec | 9960 | General/App State |
| objectiveExtractedValueForField | 10023 | General/App State |
| objectiveFieldByLooseId | 10998 | General/App State |
| objectiveHintForField | 10045 | General/App State |
| objectiveNumber | 10434 | General/App State |
| objectiveRequiredRows | 10100 | General/App State |
| objectiveSearchText | 9979 | Generic Utilities |
| objectiveSourceForField | 10033 | General/App State |
| objectiveStatusLine | 10108 | General/App State |
| objectiveValueById | 10430 | General/App State |
| objectiveValueForField | 10027 | General/App State |
| openAdmissionOverlay | 4287 | Patient Roster / Admission |
| openDecisionTreeEditor | 12670 | General/App State |
| openEvidencePromptFields | 18494 | Evidence & Physical Exam |
| openEvidencePromptVariables | 18230 | Evidence & Physical Exam |
| openFinalFindingsReview | 22816 | General/App State |
| openImportedPhoneAnswerItem | 19434 | QR / Phone Handoff |
| openPhiOverlay | 22998 | General/App State |
| openPhoneChecklistPrimary | 14210 | Checklist / Complaint CDS / Clinical Intent |
| openPhoneReturnQrOverlay | 22793 | QR / Phone Handoff |
| openPromptsAfterPhoneImport | 22826 | QR / Phone Handoff |
| openQuickDeid | 15192 | De-identification & Vault |
| openRebuildChecklistConfirmation | 4386 | Checklist / Complaint CDS / Clinical Intent |
| openServicePicker | 3316 | Service Preferences & Picker |
| openServiceSettings | 3481 | General/App State |
| openVaultFromPassword | 4029 | De-identification & Vault |
| openWorkspaceChecklistQuestion | 12927 | Checklist / Complaint CDS / Clinical Intent |
| openWorkupStudioAuditLog | 9297 | Workup Studio & Contribution |
| optionDisplayLabel | 16736 | Lab Timeline |
| optionFromItemValue | 16620 | General/App State |
| optionLooksLikeSingleAnswerQualifier | 16843 | General/App State |
| optionsFromPatchItem | 13661 | General/App State |
| parseClinicalPathwayGraph | 10779 | Clinical Pathway Graph |
| parsedObjectiveValue | 10009 | Generic Utilities |
| parsePatientChecklistEntryValue | 12975 | Checklist / Complaint CDS / Clinical Intent |
| parseStructuredJsonCandidate | 13435 | Generic Utilities |
| parseStructuredWorkupRefinement | 16264 | Workup Studio & Contribution |
| parseStudioOptionList | 8296 | Workup Studio & Contribution |
| parseWorkupStudioOpenEvidenceResult | 7272 | Workup Studio & Contribution |
| pasteDesktopPhoneBundleFromClipboard | 22100 | QR / Phone Handoff |
| pastePhoneFindingsFromClipboard | 22980 | QR / Phone Handoff |
| patchItemPayloadFromChecklistEntry | 13378 | Checklist / Complaint CDS / Clinical Intent |
| patientById | 3125 | Patient Roster / Admission |
| patientCanvasBranchState | 11114 | Patient Roster / Admission |
| patientChecklistEditConfig | 12938 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorEntries | 12990 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditorItem | 13204 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEditSection | 13167 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistEntryValue | 12971 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistItemFromPatch | 13679 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistKindForEntry | 12967 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchEntries | 13372 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchFullChecklistRows | 13877 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchGroupKeys | 13366 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchKind | 13361 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchOtherSectionLabels | 13815 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPayload | 13409 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPrompt | 13908 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptChecklistText | 13829 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRow | 13796 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowLine | 13885 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRows | 13873 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchPromptRowsText | 13903 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchScopeMeta | 13340 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionKey | 13326 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchSectionLabel | 13352 | Checklist / Complaint CDS / Clinical Intent |
| patientChecklistPatchValidation | 13562 | Checklist / Complaint CDS / Clinical Intent |
| patientContinuityCase | 14318 | Continuity |
| patientDecisionTreeCanvasGraph | 11145 | Clinical Pathway Graph |
| patientDraft | 9802 | Patient Roster / Admission |
| patientHasFollowUpContext | 9712 | Patient Roster / Admission |
| patientList | 3120 | Patient Roster / Admission |
| patientMatchesSearch | 14272 | Patient Roster / Admission |
| patientObjectiveRecord | 9966 | Patient Roster / Admission |
| patientPatchItemFields | 13649 | Patient Roster / Admission |
| patientSelectedWorkupModuleId | 4798 | Workup Studio & Contribution |
| patientTabAvailableOnDevice | 9726 | Lab Timeline |
| patientWorkupPanelElement | 12613 | Workup Studio & Contribution |
| payloadCandidateFromOpenEvidenceResult | 7208 | Evidence & Physical Exam |
| persistWorkupStudioChangeSet | 6051 | Workup Studio & Contribution |
| phoneChecklistFingerprint | 21792 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestHash | 21771 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistManifestPatchOperations | 20383 | Checklist / Complaint CDS / Clinical Intent |
| phoneChecklistRefinementSummary | 14071 | Checklist / Complaint CDS / Clinical Intent |
| phoneHandoffCompactPayloadCandidatesForQr | 20743 | QR / Phone Handoff |
| phoneHandoffMailboxConfigured | 20028 | QR / Phone Handoff |
| phoneHandoffMailboxHeaders | 20032 | QR / Phone Handoff |
| phoneHandoffMailboxPayloadFromText | 20090 | QR / Phone Handoff |
| phoneHandoffMailboxRpc | 20041 | QR / Phone Handoff |
| phoneHandoffPayloadMatchesCurrentChecklist | 19954 | Checklist / Complaint CDS / Clinical Intent |
| phoneImportGroupedRows | 19453 | QR / Phone Handoff |
| phoneImportSectionKey | 19446 | QR / Phone Handoff |
| phonePayloadFromQrDeepLink | 20727 | QR / Phone Handoff |
| phonePayloadTransferText | 19997 | QR / Phone Handoff |
| phoneQrChunkFromText | 20700 | QR / Phone Handoff |
| phoneQrDisplayPayloadsForLink | 20795 | QR / Phone Handoff |
| phoneQrStatusHint | 20884 | QR / Phone Handoff |
| phoneQrSvgForDisplayPayload | 20877 | QR / Phone Handoff |
| phoneQrSvgForLink | 20869 | QR / Phone Handoff |
| phoneQrTokenFromText | 20665 | QR / Phone Handoff |
| phoneReturnPayloadFromQrText | 22584 | QR / Phone Handoff |
| phoneReturnQrDisplayPayloadsForLink | 22634 | QR / Phone Handoff |
| phoneReturnQrSvgForDisplayPayload | 22660 | QR / Phone Handoff |
| phoneReturnTokenFromText | 22568 | QR / Phone Handoff |
| plainObject | 19946 | General/App State |
| populatePatientWorkupSelect | 9562 | Workup Studio & Contribution |
| populateServiceSelect | 3225 | General/App State |
| populateWorkupStudioItemGroupSelect | 8263 | Workup Studio & Contribution |
| populateWorkupStudioSourceMetadataDefaults | 6379 | Workup Studio & Contribution |
| postgrestInFilter | 5630 | Generic Utilities |
| prepareGithubContribution | 9050 | Workup Studio & Contribution |
| preparePhoneHandoff | 22884 | QR / Phone Handoff |
| preparePhoneQrScannerVideo | 21253 | QR / Phone Handoff |
| prepareWorkspaceAfterUnlock | 3979 | General/App State |
| primeChecklistWorkflow | 24237 | Checklist / Complaint CDS / Clinical Intent |
| promptTemplateFromResolvedPrompt | 18401 | General/App State |
| publicCatalogWorkupStatus | 7368 | Workup Studio & Contribution |
| publicWorkupCatalogConfigured | 5148 | Workup Studio & Contribution |
| publishNewWorkupToSupabase | 9121 | Workup Studio & Contribution |
| publishWorkupStudioCanonicalSection | 7452 | Workup Studio & Contribution |
| publishWorkupStudioChangeSet | 7525 | Workup Studio & Contribution |
| qrModeForText | 20823 | QR / Phone Handoff |
| qrScannerConstraintAttempts | 21194 | QR / Phone Handoff |
| qrSvgForSegments | 20827 | QR / Phone Handoff |
| qrSvgForText | 20849 | QR / Phone Handoff |
| qrSvgForTextWithSegment | 20853 | QR / Phone Handoff |
| queryText | 24186 | General/App State |
| randomBase64 | 3059 | General/App State |
| rawJsonObjectFromText | 10721 | General/App State |
| rawModuleById | 4673 | Checklist / Complaint CDS / Clinical Intent |
| readBedsideNoteValue | 14303 | Evidence & Physical Exam |
| readLocalDraftWorkups | 2391 | Workup Studio & Contribution |
| readPublicWorkupCatalogCache | 5529 | Workup Studio & Contribution |
| readServiceFields | 3426 | Service Preferences & Picker |
| rebuildChecklistWithConfirmation | 4401 | Checklist / Complaint CDS / Clinical Intent |
| recommendedWorkupModuleId | 4794 | Workup Studio & Contribution |
| reconcileChecklistWithCurrentCatalog | 4767 | Checklist / Complaint CDS / Clinical Intent |
| refinementItemCount | 14066 | General/App State |
| refinementSlug | 16174 | General/App State |
| refreshClinicalApplicabilityControls | 15589 | General/App State |
| refreshSupabaseWorkupCatalogForCurrentSession | 5747 | Workup Studio & Contribution |
| refreshWorkupConsumersAfterAuthoringChange | 7608 | Workup Studio & Contribution |
| regenerateWorkupStudioPromptTemplate | 7018 | Workup Studio & Contribution |
| remapChecklistResponseArtifacts | 13133 | Checklist / Complaint CDS / Clinical Intent |
| removeLocalDraftWorkup | 2426 | Workup Studio & Contribution |
| removeSelectedPatientChecklistItem | 13308 | Checklist / Complaint CDS / Clinical Intent |
| removeWorkupStudioSectionItem | 8243 | Workup Studio & Contribution |
| renderBedsideCompletionSummary | 17723 | Evidence & Physical Exam |
| renderCaseStatus | 19923 | General/App State |
| renderChecklist | 17835 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistInspector | 17421 | Checklist / Complaint CDS / Clinical Intent |
| renderChecklistNavigation | 17531 | Checklist / Complaint CDS / Clinical Intent |
| renderClearedWorkupSearchPrompt | 9440 | Workup Studio & Contribution |
| renderClinicalIntentSelection | 15520 | Checklist / Complaint CDS / Clinical Intent |
| renderContributionValidation | 8987 | Workup Studio & Contribution |
| renderCytoscapeStudioPathwayTree | 11474 | Workup Studio & Contribution |
| renderDecisionTreeEditor | 12626 | General/App State |
| renderDecisionTreeGraph | 12019 | Clinical Pathway Graph |
| renderDecisionTreeImportPreview | 12593 | General/App State |
| renderDecisionTreePanel | 12443 | General/App State |
| renderDecisionTreeReadableOutline | 11973 | General/App State |
| renderEvidenceReferenceCards | 17320 | Evidence & Physical Exam |
| renderFinalUpdate | 19915 | General/App State |
| renderGenericPasteBackPreview | 19033 | General/App State |
| renderHandoff | 22906 | General/App State |
| renderImportedPhoneAnswerSummary | 19469 | QR / Phone Handoff |
| renderModifierChips | 15617 | General/App State |
| renderObjectiveChips | 10167 | General/App State |
| renderObjectiveDataSurfaces | 12919 | General/App State |
| renderObjectiveEditor | 10184 | General/App State |
| renderObjectiveHeader | 10151 | General/App State |
| renderObjectiveReadOnlySurfaces | 12898 | General/App State |
| renderOverviewPasteBackResults | 18930 | General/App State |
| renderOverviewRoundsReport | 18863 | General/App State |
| renderPatientChecklistEditor | 13045 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientChecklistPatchPreview | 13613 | Checklist / Complaint CDS / Clinical Intent |
| renderPatientContext | 14766 | Patient Roster / Admission |
| renderPatientRail | 14772 | Patient Roster / Admission |
| renderPatientRosterToggle | 4525 | Patient Roster / Admission |
| renderPatientTabs | 9771 | Patient Roster / Admission |
| renderPatientWorkspace | 14638 | Patient Roster / Admission |
| renderPatientWorkupResults | 9481 | Workup Studio & Contribution |
| renderPhoneChecklistLauncher | 14169 | Checklist / Complaint CDS / Clinical Intent |
| renderPhoneChecklistWorkupResults | 14106 | Workup Studio & Contribution |
| renderPhoneQrCandidate | 20910 | QR / Phone Handoff |
| renderPhoneQrCode | 20956 | QR / Phone Handoff |
| renderPhoneReturnQrCode | 22667 | QR / Phone Handoff |
| renderPromptVariableBar | 18465 | General/App State |
| renderRoundsPasteBackPreview | 18991 | General/App State |
| renderSelectedWorkupCard | 9543 | Workup Studio & Contribution |
| renderServicePicker | 3280 | Service Preferences & Picker |
| renderServicePreferenceSummary | 3466 | Service Preferences & Picker |
| renderStructuredRefinementPreview | 18777 | General/App State |
| renderStudioItemEditor | 8494 | Workup Studio & Contribution |
| renderStudioNonItemEditor | 8715 | Workup Studio & Contribution |
| renderStudioPathwayEditor | 7953 | Workup Studio & Contribution |
| renderTodayCockpit | 14494 | General/App State |
| renderTodayReviewList | 14470 | General/App State |
| renderUnsupportedClinicalIntentResult | 9408 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkspaceChecklistDirectory | 14010 | Checklist / Complaint CDS / Clinical Intent |
| renderWorkupDecisionSurfaces | 12891 | Workup Studio & Contribution |
| renderWorkupOrderResultSurfaces | 12876 | Workup Studio & Contribution |
| renderWorkupOrdersPanel | 10264 | Workup Studio & Contribution |
| renderWorkupRows | 15922 | Workup Studio & Contribution |
| renderWorkupRowsInto | 15938 | Workup Studio & Contribution |
| renderWorkupStudio | 8865 | Workup Studio & Contribution |
| renderWorkupStudioBackendStatus | 5168 | Workup Studio & Contribution |
| renderWorkupStudioEditor | 8757 | Workup Studio & Contribution |
| renderWorkupStudioInspector | 8800 | Workup Studio & Contribution |
| renderWorkupStudioList | 7716 | Workup Studio & Contribution |
| renderWorkupStudioSectionTabs | 7814 | Workup Studio & Contribution |
| renderWorkupStudioSourceDiff | 8779 | Workup Studio & Contribution |
| reorderById | 20435 | General/App State |
| repairOpenEvidencePatchCandidate | 13477 | Evidence & Physical Exam |
| replaceAllLiteral | 18247 | General/App State |
| rerenderAfterSupabaseWorkupCatalogSync | 5596 | Workup Studio & Contribution |
| resetCurrentOpenEvidencePromptTemplate | 18555 | Evidence & Physical Exam |
| resetNoSaveSession | 4101 | Supabase & Auth |
| resetPhoneQrChunkScanner | 21484 | QR / Phone Handoff |
| resetReturnQrChunkScanner | 21488 | QR / Phone Handoff |
| resetWorkflowArtifacts | 3493 | General/App State |
| resetWorkupStudioPromptTemplate | 7010 | Workup Studio & Contribution |
| resolvedOpenEvidencePromptText | 18661 | Evidence & Physical Exam |
| resolvePromptTemplate | 18412 | General/App State |
| resolveUiComplaintModule | 15688 | Checklist / Complaint CDS / Clinical Intent |
| restoreState | 3688 | General/App State |
| reviewedSourceContextText | 14268 | General/App State |
| roundsPasteBackSummaryText | 18979 | General/App State |
| routeForNamedView | 24203 | General/App State |
| runQuickDeid | 15201 | De-identification & Vault |
| runWorkspaceContinuityDeid | 15137 | De-identification & Vault |
| runWorkspaceDeid | 15082 | De-identification & Vault |
| sameManifestItem | 20300 | General/App State |
| sameManifestSectionMeta | 20296 | General/App State |
| sameStringArray | 20292 | General/App State |
| sanitizeClinicalPathwayGraph | 10748 | Clinical Pathway Graph |
| sanitizeClinicalPathwayNode | 10628 | Clinical Pathway Graph |
| sanitizeRefinementItem | 16186 | General/App State |
| sanitizeStructuredWorkupRefinement | 16231 | Workup Studio & Contribution |
| saveCurrentOpenEvidencePromptTemplate | 18539 | Evidence & Physical Exam |
| saveDecisionTreeGraph | 10966 | Clinical Pathway Graph |
| saveDecisionTreeNodeLayout | 10985 | Layout & Navigation Chrome |
| saveDecisionTreeToLocalWorkupFile | 12838 | Workup Studio & Contribution |
| saveGenericPasteBackForActivePatient | 19142 | Patient Roster / Admission |
| saveLayoutPreferences | 3726 | Layout & Navigation Chrome |
| saveLocalDraftWorkup | 2418 | Workup Studio & Contribution |
| saveLocalDraftWorkups | 2401 | Workup Studio & Contribution |
| savePatientContinuityCase | 14343 | Continuity |
| savePlainOpenEvidenceAnswerForActivePatient | 19106 | Evidence & Physical Exam |
| saveRoundsPasteBackForActivePatient | 19067 | Patient Roster / Admission |
| saveSelectedPatientChecklistItem | 13291 | Checklist / Complaint CDS / Clinical Intent |
| saveSelectedPatientDrafts | 14977 | Patient Roster / Admission |
| saveServicePreferences | 3195 | Service Preferences & Picker |
| saveState | 3699 | General/App State |
| saveStructuredRefinement | 19752 | General/App State |
| saveTodayUpdate | 14556 | General/App State |
| saveWorkspaceContext | 14935 | General/App State |
| saveWorkspaceContinuity | 14950 | Continuity |
| saveWorkspaceFindings | 14962 | General/App State |
| saveWorkupStudioChangeSet | 7637 | Workup Studio & Contribution |
| saveWorkupStudioPathwayGraph | 7909 | Workup Studio & Contribution |
| saveWorkupStudioPathwayNodeLayout | 7921 | Workup Studio & Contribution |
| saveWorkupStudioPromptOverride | 6986 | Workup Studio & Contribution |
| saveWorkupStudioState | 5965 | Workup Studio & Contribution |
| saveWorkupStudioStateNow | 5973 | Workup Studio & Contribution |
| scheduleDecisionTreeNodeUpdate | 12714 | General/App State |
| schedulePatientWorkupSearch | 9620 | Workup Studio & Contribution |
| schedulePhoneQrScannerGuidance | 21147 | QR / Phone Handoff |
| scheduleReturnQrScannerGuidance | 21596 | QR / Phone Handoff |
| scheduleStandaloneWorkupSearch | 9609 | Workup Studio & Contribution |
| scrollChecklistEntry | 17523 | Checklist / Complaint CDS / Clinical Intent |
| scrollPatientPanelIntoView | 9697 | Patient Roster / Admission |
| searchFieldParts | 4818 | Generic Utilities |
| secondaryIntentSuggestionsForModifiers | 15499 | Checklist / Complaint CDS / Clinical Intent |
| sectionMetaForRefinement | 16221 | General/App State |
| selectClinicalIntent | 15547 | Checklist / Complaint CDS / Clinical Intent |
| selectedApplicabilityContextSignals | 15298 | General/App State |
| selectedChecklistSourceIds | 17294 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalIntents | 15258 | Checklist / Complaint CDS / Clinical Intent |
| selectedClinicalModifierValues | 15234 | General/App State |
| selectedDecisionTreeGraphForEdit | 12609 | Clinical Pathway Graph |
| selectedDecisionTreeNode | 10961 | General/App State |
| selectedKnowledgeModule | 15254 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientChecklistEditorEntry | 12986 | Checklist / Complaint CDS / Clinical Intent |
| selectedPatientContextText | 14232 | Patient Roster / Admission |
| selectedStudioItem | 6168 | Workup Studio & Contribution |
| selectedTask | 18176 | General/App State |
| selectedWorkupApplicabilityIssue | 15419 | Workup Studio & Contribution |
| selectedWorkupStudioModule | 6126 | Workup Studio & Contribution |
| selectedWorkupStudioPathwayEntry | 7872 | Workup Studio & Contribution |
| selectPatient | 14876 | Patient Roster / Admission |
| selectPatientWorkupModule | 9629 | Workup Studio & Contribution |
| selectServiceFromPicker | 3339 | General/App State |
| sendWorkupStudioMagicLink | 5297 | Workup Studio & Contribution |
| serviceFieldsForPrefix | 3404 | Service Preferences & Picker |
| servicePickerForPrefix | 3238 | Service Preferences & Picker |
| servicePickerMatches | 3257 | Service Preferences & Picker |
| servicePickerOptions | 3323 | Service Preferences & Picker |
| servicePreferenceContextText | 3168 | Service Preferences & Picker |
| servicePreferenceLabel | 3161 | Lab Timeline |
| serviceProfileById | 3145 | Service Preferences & Picker |
| serviceProfileSearchText | 3248 | Service Preferences & Picker |
| serviceUserContext | 3186 | Service Preferences & Picker |
| setBedsideCompletionState | 17767 | Evidence & Physical Exam |
| setBedsideNoteValue | 14294 | Evidence & Physical Exam |
| setChecklistBuildDisabled | 9684 | Checklist / Complaint CDS / Clinical Intent |
| setEndorsementAnswer | 16969 | General/App State |
| setFieldValueIfInactive | 14369 | General/App State |
| setHandoffStatus | 21886 | General/App State |
| setLayoutNavCollapsed | 3841 | Layout & Navigation Chrome |
| setLayoutSize | 3876 | Layout & Navigation Chrome |
| setObjectiveDataValue | 10139 | General/App State |
| setPatientChecklistEditStatus | 12994 | Checklist / Complaint CDS / Clinical Intent |
| setPatientChecklistPatchStatus | 13606 | Checklist / Complaint CDS / Clinical Intent |
| setPatientRosterExpanded | 4545 | Patient Roster / Admission |
| setPatientTab | 9749 | Patient Roster / Admission |
| setPatientWorkupPane | 4622 | Workup Studio & Contribution |
| setPhoneBundleLoadStatus | 21874 | QR / Phone Handoff |
| setPhoneQrScannerActive | 21157 | QR / Phone Handoff |
| setPhoneQrScannerStatus | 21137 | QR / Phone Handoff |
| setPhoneReturnQrMaximized | 22785 | QR / Phone Handoff |
| setPromptTemplateEditingState | 18509 | General/App State |
| setReturnQrScannerActive | 21606 | QR / Phone Handoff |
| setReturnQrScannerStatus | 21586 | QR / Phone Handoff |
| setSelectedWorkupModuleId | 4804 | Workup Studio & Contribution |
| setServiceFields | 3394 | Service Preferences & Picker |
| setSourceMode | 15026 | General/App State |
| setStatus | 3715 | General/App State |
| setTodayWorkflowMode | 14356 | General/App State |
| setupPromptEditorAutocomplete | 23042 | General/App State |
| setVaultStatus | 3041 | De-identification & Vault |
| setWorkupNavOpen | 3851 | Workup Studio & Contribution |
| setWorkupOrdersCollapsed | 3764 | Workup Studio & Contribution |
| setWorkupStudioNavOpen | 3869 | Workup Studio & Contribution |
| setWorkupStudioSourcePromptBuiltAt | 6306 | Workup Studio & Contribution |
| setWorkupStudioSourceWorkflowStartedAt | 6298 | Workup Studio & Contribution |
| sharePhonePayloadForTransfer | 22070 | QR / Phone Handoff |
| shouldBuildInitialChecklist | 24327 | Checklist / Complaint CDS / Clinical Intent |
| showAllChecklistQuestions | 17640 | Checklist / Complaint CDS / Clinical Intent |
| showCompletionBedsideNote | 22832 | Evidence & Physical Exam |
| showNewWorkupDialog | 8889 | Workup Studio & Contribution |
| showVaultAccess | 3934 | De-identification & Vault |
| showView | 4459 | General/App State |
| signOutWorkupStudioSupabase | 5825 | Workup Studio & Contribution |
| simplifyLocalWorkupResultList | 15557 | Workup Studio & Contribution |
| singleSubjectAnswerChoiceSet | 16848 | General/App State |
| slugId | 10537 | General/App State |
| snapshotChecklistResponseArtifacts | 13120 | Checklist / Complaint CDS / Clinical Intent |
| sortedComplaintModules | 4955 | Checklist / Complaint CDS / Clinical Intent |
| sourceIdsForCatalogRows | 5644 | Checklist / Complaint CDS / Clinical Intent |
| sourceRegistryLookup | 17313 | General/App State |
| splitChecklistOptions | 16597 | Checklist / Complaint CDS / Clinical Intent |
| stableJsonStringify | 21720 | General/App State |
| stableJsonValue | 21705 | General/App State |
| stableWorkupStudioItemId | 7297 | Workup Studio & Contribution |
| startFullFrameQrFallback | 21324 | QR / Phone Handoff |
| startManualQrScanner | 21392 | QR / Phone Handoff |
| startPhoneQrScanner | 21545 | QR / Phone Handoff |
| startReturnQrScanner | 21627 | QR / Phone Handoff |
| startRobustQrScanner | 21473 | QR / Phone Handoff |
| startSinglePatientWorkflow | 4126 | Patient Roster / Admission |
| startZxingQrScanner | 21433 | QR / Phone Handoff |
| stopPhoneQrCarousel | 20898 | QR / Phone Handoff |
| stopPhoneQrScanner | 21164 | QR / Phone Handoff |
| stopPhoneReturnQrCarousel | 20904 | QR / Phone Handoff |
| stopReturnQrScanner | 21613 | QR / Phone Handoff |
| storedRefinementsForSelectedWorkup | 16296 | Workup Studio & Contribution |
| structuredJsonObjectCandidates | 13417 | General/App State |
| structuredRefinementSummary | 18758 | General/App State |
| studioDefaultItemType | 8332 | Workup Studio & Contribution |
| studioGeneratedItemId | 8343 | Workup Studio & Contribution |
| studioItemAnswerMode | 8323 | Workup Studio & Contribution |
| studioItemNormalAnswers | 8319 | Workup Studio & Contribution |
| studioItemOptions | 8312 | Workup Studio & Contribution |
| studioNewItemForSection | 8351 | Workup Studio & Contribution |
| studioPathwayGraphFromEditor | 7881 | Workup Studio & Contribution |
| studioSectionDefinition | 6149 | Workup Studio & Contribution |
| studioSectionItems | 6157 | Workup Studio & Contribution |
| studioSectionPayload | 6153 | Workup Studio & Contribution |
| studioSourceIdsForCurrentSection | 6174 | Workup Studio & Contribution |
| submitNewWorkupForReview | 9167 | Workup Studio & Contribution |
| supabaseAuthHeaders | 5334 | Supabase & Auth |
| supabaseRowToWorkupChangeSet | 6005 | Workup Studio & Contribution |
| supabaseSourceRowToRegistrySource | 5461 | Supabase & Auth |
| supabaseSourcesCatalogPath | 5655 | Checklist / Complaint CDS / Clinical Intent |
| supabaseWorkupCatalogAgeMs | 5742 | Workup Studio & Contribution |
| supabaseWorkupRowToModule | 5477 | Workup Studio & Contribution |
| supabaseWorkupsCatalogPath | 5625 | Workup Studio & Contribution |
| supabaseWorkupSectionsCatalogPath | 5638 | Workup Studio & Contribution |
| syncAllServicePreferenceFields | 3452 | Service Preferences & Picker |
| syncClinicalModifierQuickChips | 15679 | General/App State |
| syncDecisionTreeHighlightToggle | 12885 | General/App State |
| syncImportedAnswerSummaryRow | 19409 | General/App State |
| syncLayoutForViewport | 3819 | Layout & Navigation Chrome |
| syncLocalWorkupStep | 15566 | Workup Studio & Contribution |
| syncOpenEvidenceAnswerFields | 19363 | Evidence & Physical Exam |
| syncOpenEvidenceApplyButtons | 19159 | Evidence & Physical Exam |
| syncPatientChecklistEditorControls | 13000 | Checklist / Complaint CDS / Clinical Intent |
| syncPatientChecklistPatchSectionSelects | 13332 | Checklist / Complaint CDS / Clinical Intent |
| syncSelectedPatientInputs | 14281 | Patient Roster / Admission |
| syncTodayFieldsFromCase | 14412 | General/App State |
| syncWorkupConcernInputs | 14307 | Workup Studio & Contribution |
| syncWorkupRefinementPreview | 18804 | Workup Studio & Contribution |
| syncWorkupSelectors | 9586 | Workup Studio & Contribution |
| syncWorkupStudioPromptOutput | 6974 | Workup Studio & Contribution |
| syncWorkupStudioSelectionToActivePatient | 6133 | Workup Studio & Contribution |
| taskDescription | 4648 | General/App State |
| taskHasPasteBack | 18185 | General/App State |
| taskIsPlainEvidenceReview | 18189 | Evidence & Physical Exam |
| taskLabel | 4644 | Lab Timeline |
| titleCaseComponent | 16721 | General/App State |
| titleFromId | 4640 | General/App State |
| todayBaselinePatchFromElements | 14403 | General/App State |
| todayDateKey | 14314 | General/App State |
| todayInputsFromElements | 14375 | General/App State |
| todayPromptTaskId | 14440 | General/App State |
| todaySourceContext | 14425 | General/App State |
| todayWorkflowMode | 14348 | General/App State |
| toggleChecklistAnswer | 17028 | Checklist / Complaint CDS / Clinical Intent |
| togglePatientRosterFromNav | 4557 | Patient Roster / Admission |
| toggleWorkupOrdersCollapsed | 3771 | Workup Studio & Contribution |
| trimCompactQrRow | 20100 | QR / Phone Handoff |
| uiValidatedIntentsForModule | 15714 | Checklist / Complaint CDS / Clinical Intent |
| unableAssessGroup | 16635 | General/App State |
| uniqueChecklistOptions | 16612 | Checklist / Complaint CDS / Clinical Intent |
| uniquePatientChecklistItemId | 13190 | Checklist / Complaint CDS / Clinical Intent |
| uniqueSourceIds | 15735 | General/App State |
| unlockVault | 4020 | De-identification & Vault |
| updateBedsideCaseTitles | 17498 | Evidence & Physical Exam |
| updateChecklistAnswer | 16945 | Checklist / Complaint CDS / Clinical Intent |
| updateChecklistMetrics | 17802 | Checklist / Complaint CDS / Clinical Intent |
| updateItemPayloadFromForm | 8403 | General/App State |
| updateOpenEvidenceChangePreview | 19200 | Evidence & Physical Exam |
| updatePatient | 4359 | Patient Roster / Admission |
| updatePatientObjectiveStatusHeader | 10118 | Patient Roster / Admission |
| updateSelectedDecisionTreeNodeFromInputs | 12688 | General/App State |
| updateServiceCustomField | 3436 | General/App State |
| updateServiceSettingsPreview | 3473 | General/App State |
| updateWorkupSearchOnly | 9592 | Workup Studio & Contribution |
| upsertWorkupStudioRows | 7357 | Workup Studio & Contribution |
| validateContributionInput | 9022 | Workup Studio & Contribution |
| validateNewWorkupPasteInput | 9113 | Workup Studio & Contribution |
| validPublicCatalogSnapshot | 5504 | Checklist / Complaint CDS / Clinical Intent |
| vaultMeta | 3032 | De-identification & Vault |
| vaultPayload | 3694 | De-identification & Vault |
| verifyPublishedWorkupPublicCatalog | 7373 | Workup Studio & Contribution |
| visibleBedsideNoteInput | 14289 | Evidence & Physical Exam |
| visibleChecklistEntries | 17257 | Checklist / Complaint CDS / Clinical Intent |
| visibleDecisionTreeChildren | 11089 | General/App State |
| visibleDecisionTreeFlatNodes | 11093 | General/App State |
| withZxingFallbackStop | 21381 | General/App State |
| workupCatalogSupabaseRequest | 5388 | Workup Studio & Contribution |
| workupConcernInputForCurrentContext | 15709 | Workup Studio & Contribution |
| workupExamRows | 10238 | Workup Studio & Contribution |
| workupItemSearchText | 9922 | Workup Studio & Contribution |
| workupItemsForRow | 10216 | Workup Studio & Contribution |
| workupLayoutUsesPaneSwitcher | 3760 | Workup Studio & Contribution |
| workupMatchBadge | 9306 | Workup Studio & Contribution |
| workupPickerGroups | 9348 | Workup Studio & Contribution |
| workupSearchTokens | 4885 | Workup Studio & Contribution |
| workupStudioAuthRedirectUrl | 5267 | Workup Studio & Contribution |
| workupStudioBackendAuthenticated | 5152 | Workup Studio & Contribution |
| workupStudioBackendConfigured | 5144 | Workup Studio & Contribution |
| workupStudioBackendSignedIn | 5156 | Workup Studio & Contribution |
| workupStudioCanEditWorkup | 5164 | Workup Studio & Contribution |
| workupStudioCanonicalSourceTerm | 6470 | Workup Studio & Contribution |
| workupStudioCanReview | 5160 | Workup Studio & Contribution |
| workupStudioChangeSetAfterSnapshot | 7026 | Workup Studio & Contribution |
| workupStudioChangeSetsForModule | 6094 | Workup Studio & Contribution |
| workupStudioDefaultItemType | 8131 | Workup Studio & Contribution |
| workupStudioDraftGraphFromSourcePacket | 6680 | Workup Studio & Contribution |
| workupStudioFallbackDraftConcepts | 6609 | Workup Studio & Contribution |
| workupStudioItemRowsFromPayload | 7305 | Workup Studio & Contribution |
| workupStudioItemSearchText | 8275 | Workup Studio & Contribution |
| workupStudioLatestChangeSet | 6098 | Workup Studio & Contribution |
| workupStudioMagicLinkErrorMessage | 5275 | Workup Studio & Contribution |
| workupStudioModuleMatches | 6112 | Workup Studio & Contribution |
| workupStudioNewItemForGroup | 8160 | Workup Studio & Contribution |
| workupStudioNodeRationale | 7060 | Workup Studio & Contribution |
| workupStudioNodeReviewerStatus | 7064 | Workup Studio & Contribution |
| workupStudioNodeSourceIds | 7036 | Workup Studio & Contribution |
| workupStudioNodeSourceSection | 7049 | Workup Studio & Contribution |
| workupStudioOAuthErrorMessage | 5292 | Workup Studio & Contribution |
| workupStudioOpenEvidencePrompt | 6855 | Workup Studio & Contribution |
| workupStudioPathwayBuilderPrompt | 6806 | Workup Studio & Contribution |
| workupStudioPathwayDiff | 7140 | Workup Studio & Contribution |
| workupStudioPathwayGraph | 7853 | Workup Studio & Contribution |
| workupStudioPathwayNodeLabel | 7032 | Workup Studio & Contribution |
| workupStudioPathwayNodeMap | 7136 | Workup Studio & Contribution |
| workupStudioPathwayNodeSignature | 7123 | Workup Studio & Contribution |
| workupStudioPathwayProvenanceAudit | 7068 | Workup Studio & Contribution |
| workupStudioPathwayPublishIssues | 7163 | Workup Studio & Contribution |
| workupStudioPathwaySchemaIssues | 7097 | Workup Studio & Contribution |
| workupStudioPatientTailoringContext | 6250 | Workup Studio & Contribution |
| workupStudioPromptOptionLabels | 6192 | Workup Studio & Contribution |
| workupStudioPromptTemplateKey | 6957 | Workup Studio & Contribution |
| workupStudioPromptWhenSummary | 6202 | Workup Studio & Contribution |
| workupStudioReviewCaseRowsFromPayload | 7327 | Workup Studio & Contribution |
| workupStudioSavedPromptTemplate | 6963 | Workup Studio & Contribution |
| workupStudioSectionIcon | 7767 | Workup Studio & Contribution |
| workupStudioSectionInventoryText | 6219 | Workup Studio & Contribution |
| workupStudioSectionKeyFromPromptTemplateKey | 6851 | Workup Studio & Contribution |
| workupStudioSectionMeta | 7803 | Workup Studio & Contribution |
| workupStudioSectionMetric | 7792 | Workup Studio & Contribution |
| workupStudioSourceAttestationAccepted | 7157 | Workup Studio & Contribution |
| workupStudioSourceBackedPathwayPrompt | 6400 | Workup Studio & Contribution |
| workupStudioSourceDraftConceptCatalog | 6520 | Workup Studio & Contribution |
| workupStudioSourceDraftConcepts | 6632 | Workup Studio & Contribution |
| workupStudioSourceDraftNode | 6647 | Workup Studio & Contribution |
| workupStudioSourceDraftNodeId | 6643 | Workup Studio & Contribution |
| workupStudioSourceEvidenceRecord | 6370 | Workup Studio & Contribution |
| workupStudioSourceFactTokens | 6492 | Workup Studio & Contribution |
| workupStudioSourceMetadataForEvidence | 6350 | Workup Studio & Contribution |
| workupStudioSourcePacketFromInputs | 6333 | Workup Studio & Contribution |
| workupStudioSourcePacketIssues | 6391 | Workup Studio & Contribution |
| workupStudioSourceTimelineFromInput | 6318 | Workup Studio & Contribution |
| workupStudioSourceTokensForConcept | 6597 | Workup Studio & Contribution |
| workupStudioSourceUnsupportedNodes | 6667 | Workup Studio & Contribution |
| workupStudioSupabaseErrorMessage | 5346 | Workup Studio & Contribution |
| workupStudioSupabaseRequest | 5360 | Workup Studio & Contribution |
| workupStudioUniqueItemId | 8147 | Workup Studio & Contribution |
| wrapTreeText | 11304 | General/App State |
| writePublicWorkupCatalogCache | 5513 | Workup Studio & Contribution |
| zxingQrScannerAvailable | 21178 | Lab Timeline |
| zxingResultText | 21261 | General/App State |
