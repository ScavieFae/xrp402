
Taken from terminal, likely needs cleanup

Our Steps vs. Known Patterns                                                                       
                                                                                                     
  Here's the side-by-side: our original 8 steps, the EVM reference implementation, and what xrpl.js  
  actually provides.                                                                                 
                                                                                                     
  What we got right                                                                                  
                                                                                                     
  The ordering principle holds. Both the EVM reference and the XRPL community pattern do offline     
  checks first, network calls last. Our instinct to fail fast on cheap checks was correct — it's the 
  standard pattern.                                                                                  
                                                                                                     
  Signature verification early — the EVM reference does this too. They verify the EIP-712 signature  
  before checking balances or amounts.                                                               
                                                                                                     
  Balance check as UX optimization — this was our "genuinely our addition." Turns out the EVM        
  reference does the same thing. They call balanceOf() on-chain during verify. But here's the nuance:
   they treat it as a soft failure. If the RPC call fails (network error, node hiccup), they continue
   verification rather than rejecting. The reasoning: if the balance check fails, settlement will    
  catch it — don't reject a potentially valid payment over a transient network issue.                
                                                                                                     
  Re-verify before settle — the EVM reference calls verify() at the start of settle(). State can     
  change between the client's verify request and the settle request, so you check again.             
                                                                                                     
  What xrpl.js gives us for free                                                                     
                                                                                                     
  This is the best finding. Three of our steps map directly to built-in library functions:           
  Our Step: Step 1: Deserialize txBlob                                                               
  xrpl.js Function: decode(txBlob)                                                                   
  What it does: Returns full transaction object from hex                                             
  ────────────────────────────────────────                                                           
  Our Step: (new) Structural validation                                                              
  xrpl.js Function: validate(tx)                                                                     
  What it does: Checks required fields, valid combinations, throws on malformed                      
  ────────────────────────────────────────                                                           
  Our Step: Step 2: Verify signature                                                                 
  xrpl.js Function: verifySignature(txBlob)                                                          
  What it does: Cryptographic signature check, returns boolean                                       
  We didn't have a structural validation step. validate() catches things like: Payment missing       
  Amount, invalid field combinations (SendMax without Paths), wrong types. It's a freebie from the   
  SDK — catches malformed transactions before we waste time on deeper checks.                        
                                                                                                     
  What we missed                                                                                     
                                                                                                     
  Cross-check decoded fields against authorization. The client sends us both a txBlob and an         
  authorization object with pre-parsed fields. We should decode the blob and confirm the parsed      
  fields match what's actually signed. Trust but verify — if the client says "destination is rX" but 
  the blob says "destination is rY," that's either a bug or an attack.                               
                                                                                                     
  Reject tfPartialPayment explicitly. This was in our open questions but should be a hard step. The  
  XRPL partial payment flag lets a transaction deliver less than the stated amount. In an x402       
  context, this would mean someone sends a "10 XRP" payment that delivers 2. We reject any           
  transaction with that flag set.                                                                    
                                                                                                     
  Fee reasonableness check. The XRPL docs recommend checking that fees aren't absurdly high. A client
   could accidentally (or maliciously) set a 1000 XRP fee. Not our problem exactly — it's the        
  client's money — but flagging it is good practice. The EVM reference doesn't do this because gas is
   the facilitator's problem there; on XRPL it's the client's, so it's a softer check.               
                                                                                                     
  Destination existence check. Separate from the balance check. If the destination account doesn't   
  exist on the XRPL, payment to it requires enough XRP to fund the reserve (currently 10 XRP). For   
  issued currencies (RLUSD), the destination must exist AND have a trust line. This is a network call
   to account_info on the destination.                                                               
                                                                                                     
  Time buffer on LastLedgerSequence. The EVM reference adds a 6-second buffer to time bounds —       
  validBefore must be at least 6 seconds in the future. We should do something similar: if           
  LastLedgerSequence is only 1-2 ledgers away (~3-8 seconds), it might expire before settlement      
  completes.                                                                                         
                                                                                                     
  The simulate API — open question answered                                                          
                                                                                                     
  The simulate method exists. It shipped in rippled 2.4.0 (March 2025) via XLS-69. It does exactly   
  what we wanted — dry-runs a transaction against current ledger state and returns the result without
   submitting.                                                                                       
                                                                                                     
  But: it requires unsigned transactions. We receive signed blobs. We could strip the signature and  
  simulate, but that adds complexity for something our verification pipeline mostly covers. More     
  importantly, simulate is useful on the client side — before signing, the client can simulate to    
  check "will this work?" Our facilitator shouldn't need it if our verification steps are solid.     
                                                                                                     
  Worth documenting as a recommendation for x402 XRPL clients, not as part of our pipeline.          
                                                                                                     
  Revised Verification Pipeline                                                                      
                                                                                                     
  Here's what the evidence says our steps should be:                                                 
                                                                                                     
  OFFLINE CHECKS (no network needed):                                                                
   1. decode(txBlob)              → deserialize to tx object                                         
   2. validate(tx)                → structural checks (xrpl.js built-in)                             
   3. verifySignature(txBlob)     → cryptographic check (xrpl.js built-in)                           
   4. Cross-check decoded fields  → blob matches authorization object                                
   5. Check destination           → matches requirements.payTo                                       
   6. Check amount                → meets or exceeds requirements.amount                             
   7. Check asset                 → matches requirements.asset                                       
   8. Reject tfPartialPayment     → hard reject if flag present                                      
                                                                                                     
  NETWORK CHECKS (require XRPL connection):                                                          
   9. account_info(source)        → balance ≥ amount + fee, sequence valid                           
  10. ledger_current              → LastLedgerSequence in valid future range (with buffer)           
  11. account_info(destination)   → account exists (XRP), trust line exists (RLUSD)                  
                                                                                                     
  All network checks soft-fail — if the call fails,                                                  
  continue rather than reject (settlement will catch real problems).                                 
                                                                                                     
  Steps 1-8 are pure computation. Steps 9-11 hit the network. The EVM reference follows this same    
  split. The soft-failure pattern on network checks is directly borrowed from how they handle        
  balanceOf() — a transient RPC error shouldn't kill a valid payment.  
