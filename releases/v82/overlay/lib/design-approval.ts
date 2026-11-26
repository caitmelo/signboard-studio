import type {DesignApproval} from './local-drafts';
/** Approval succeeds only after the exact issue acknowledgement is persisted. */
export async function approveWithIssues(issues:string[],accepted:boolean,persist:(record:DesignApproval)=>Promise<void>):Promise<DesignApproval>{
 const acceptedIssues=[...new Set(issues.filter(Boolean))];
 if(acceptedIssues.length&&!accepted)throw Error('Review and accept the listed issues before approving.');
 const record={approvedAt:new Date().toISOString(),acceptedIssues};
 await persist(record);return record;
}
