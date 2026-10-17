/**
 * engine/tests/kernel-m1-leakdialects.test.js
 *
 * M1.2 (Vikunja #771/#758) — leaked tool-call dialects, from the LIVE
 * acceptance run v2 (Oct 14 ~11:37pm MT): the Lawyer's response to the
 * re-issued memo directive reached #management as raw markup —
 *
 *   <|tool_call_start|>[write(path='/workspace/legal_matters/llc_usage_credit_token_memo.md', cont...
 *
 * Two lessons: (1) the detector's dialect coverage must include the
 * <|tool_call_start|> token and bare [write(path= / [read(path= style
 * calls (agents emit short tool names, not only fileWrite/fileRead);
 * (2) that message bypassed the poller gate entirely via a direct-post
 * path — gating that path is M2 scope, tracked on #771. This suite
 * covers lesson (1): the exact leaked string must be flagged.
 */
'use strict';

const { findUnexecutedCallSyntax } = require('../../utils/anthropic');

const LIVE_LEAK = "<|tool_call_start|>[write(path='/workspace/legal_matters/llc_usage_credit_token_memo.md', content='# Memo')]";

describe('M1.2 leaked dialects: the live v2 leak is flagged', () => {
  test('Given the exact live leak string, then it is flagged as unexecuted call syntax', () => {
    expect(findUnexecutedCallSyntax(LIVE_LEAK)).not.toBeNull();
  });
  test('Given a bare [write(path= call without the control token, then it is flagged', () => {
    expect(findUnexecutedCallSyntax("[write(path='a.md', content='x')]")).not.toBeNull();
  });
  test('Given a bare [read(path= call, then it is flagged', () => {
    expect(findUnexecutedCallSyntax("[read(path='a.md')]")).not.toBeNull();
  });
  test('Given the <|tool_call_start|> token alone, then it is flagged', () => {
    expect(findUnexecutedCallSyntax('<|tool_call_start|>')).not.toBeNull();
  });
  test('Given ordinary prose mentioning writing a file, then it is NOT flagged', () => {
    expect(findUnexecutedCallSyntax('I will write the file and read it back when done.')).toBeNull();
  });
});
