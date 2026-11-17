import { CaseRecord, CORRESPONDENCE_TYPE, CorrespondenceTemplate, CorrespondenceType, displayDueDate } from './types';

/**
 * Demonstration correspondence wording. Neutral and professional; it states no statutory
 * deadline, legal consequence, fee rule or clock effect. Agencies replace it with approved
 * wording through Administration > Templates (each change creates a new template version).
 */
export const TEMPLATE_WORDING: Record<string, { name: string; subject: string; body: string }> = {
  [CORRESPONDENCE_TYPE.ACKNOWLEDGEMENT]: {
    name: 'Acknowledgement',
    subject: 'Acknowledgement of your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

This letter acknowledges receipt of your Freedom of Information Act (FOIA) request, received on {{receivedDate}}, for records described as "{{requestTitle}}".

Your request has been assigned tracking number {{caseId}}. Please quote this number in any correspondence with our office about this request.

We will contact you if we need further information to process your request. You may ask about the status of your request at any time by contacting the FOIA Office.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.CLARIFICATION]: {
    name: 'Clarification request',
    subject: 'Clarification needed for your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are reviewing your Freedom of Information Act (FOIA) request {{caseId}}, received on {{receivedDate}}, for records described as "{{requestTitle}}".

Before we can continue, we need you to clarify one aspect of your request.

{{clarificationDetails}}

{{clarificationQuestions}}

Please reply to this letter with the information requested and quote tracking number {{caseId}}. When we receive your reply, it will be recorded against your request and we will continue our review.

If you have any questions about this letter, please contact the FOIA Office.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.FEE_ESTIMATE]: {
    name: 'Fee estimate',
    subject: 'Fee estimate for your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are writing about your Freedom of Information Act (FOIA) request {{caseId}} for records described as "{{requestTitle}}".

We have prepared an estimate of the fees associated with processing your request. The estimate and the basis on which it was prepared are enclosed with this letter.

Please tell us in writing whether you agree to the estimated fees, would like to narrow the scope of your request, or wish to ask for a fee waiver. Please quote tracking number {{caseId}} in your reply.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.EXTENSION]: {
    name: 'Extension notice',
    subject: 'Update on the processing of your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are writing to let you know that we need more time to complete our response to your Freedom of Information Act (FOIA) request {{caseId}}, received on {{receivedDate}}, for records described as "{{requestTitle}}".

We are continuing to search for and review records that may respond to your request. We will write to you again with an update on our progress.

You may contact the FOIA Office at any time to discuss your request, including whether narrowing its scope could help us respond sooner.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.INTERIM_RELEASE]: {
    name: 'Interim release',
    subject: 'Interim release of records for your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are providing an interim release of records in response to your Freedom of Information Act (FOIA) request {{caseId}} for records described as "{{requestTitle}}".

The enclosed records are being released to you now while we continue to process the remainder of your request. We will write to you again when we have completed our review of the remaining records.

If you have any questions about this release, please contact the FOIA Office and quote tracking number {{caseId}}.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.FINAL_RESPONSE]: {
    name: 'Final response',
    subject: 'Response to your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We have completed the processing of your Freedom of Information Act (FOIA) request {{caseId}}, received on {{receivedDate}}, for records described as "{{requestTitle}}".

Our determination on your request, and any records released to you, are enclosed with this letter.

If you have any questions about this response, please contact the FOIA Office and quote tracking number {{caseId}}.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.COORDINATION_NOTICE]: {
    name: 'Consultation/Referral notice',
    subject: 'Update on your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are writing to update you on your Freedom of Information Act (FOIA) request {{caseId}} for records described as "{{requestTitle}}".

Some of the records we located involve another office or agency. We have contacted them about those records and will write to you again when we have more information.

If you have any questions, please contact the FOIA Office and quote tracking number {{caseId}}.

Sincerely,
FOIA Office`,
  },
  [CORRESPONDENCE_TYPE.OTHER]: {
    name: 'General letter',
    subject: 'Your FOIA request {{caseId}}',
    body: `Dear {{requesterName}},

We are writing about your Freedom of Information Act (FOIA) request {{caseId}} for records described as "{{requestTitle}}".

If you have any questions, please contact the FOIA Office and quote tracking number {{caseId}}.

Sincerely,
FOIA Office`,
  },
};

/** Text left by older builds while approved wording was outstanding; replaced on load. */
export const isLegacyPlaceholder = (text?: string) => !!text && /\[Approved (template )?wording pending/.test(text);

export const MERGE_FIELDS = ['caseId', 'requesterName', 'requestTitle', 'receivedDate'];

/**
 * Fills supported merge fields from the case. Unknown or empty fields are removed, so the
 * result never shows raw {{tokens}}, and blank paragraphs left behind are collapsed.
 */
export function mergeTemplate(text: string, caseRecord: Pick<CaseRecord, 'id' | 'requester' | 'title' | 'received'>, extra: Record<string, string> = {}) {
  const values: Record<string, string> = {
    caseId: caseRecord.id,
    requesterName: caseRecord.requester && caseRecord.requester !== 'Not provided' ? caseRecord.requester : 'Requester',
    requestTitle: caseRecord.title,
    receivedDate: displayDueDate(caseRecord.received),
    ...extra,
  };
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key]?.trim() ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function templateFor(templates: CorrespondenceTemplate[], type: CorrespondenceType) {
  return templates.find(item => item.type === type);
}

/** Subject and body for a new letter of this type, from the stored template or the built-in wording. */
export function draftLetter(templates: CorrespondenceTemplate[], type: CorrespondenceType, caseRecord: CaseRecord, extra: Record<string, string> = {}) {
  const template = templateFor(templates, type);
  const source = template && !isLegacyPlaceholder(template.body) ? template : TEMPLATE_WORDING[type] || TEMPLATE_WORDING[CORRESPONDENCE_TYPE.OTHER];
  return { templateId: template?.id || '', subject: mergeTemplate(source.subject, caseRecord, extra), body: mergeTemplate(source.body, caseRecord, extra) };
}
