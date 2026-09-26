# Sphynx: PDF Unlock

Removes the lock from a PDF the user already has the password for, entirely on their device. It never guesses a password.

## Language

### Locks

**Open password**:
The password a reader must type before a PDF will display.
_Avoid_: User password, document password, "the password" when restrictions are also in play

**Restrictions**:
Print, copy or edit limits set by an owner password on a PDF that opens without prompting.
_Avoid_: Owner restrictions, permissions, print or copy limits

**Locked PDF**:
A PDF with an open password, restrictions, or both.
_Avoid_: Encrypted PDF, protected PDF

**Restricted PDF**:
A locked PDF with restrictions but no open password.
_Avoid_: Owner-only PDF

### Attempts

**Attempt**:
One file taken from the moment it is picked, dropped, pasted or shared until it reaches an outcome or is abandoned (Cancel, Back, or picking another file).
_Avoid_: Session, job, run

**Password prompt**:
The pause in an attempt where Sphynx asks for the open password. It is not an outcome: the attempt continues once a password is typed.
_Avoid_: Needs password state, password screen

**Wrong password**:
A password prompt shown again because the typed password did not open the PDF. The attempt continues.
_Avoid_: Invalid password, failed attempt

**Date form**:
One way of writing a typed date as digits (day-month-year, year-month-day, month-day-year, each with a long or short year), tried after the exact text. The app names the form that worked.
_Avoid_: Variant, permutation, guess

**Abandoned**:
How an attempt ends without an outcome: the user pressed Cancel or Back, or picked another file.
_Avoid_: Cancelled, reset

### Results

**Unlocked copy**:
The new PDF Sphynx produces from a locked PDF: same content, no open password, no restrictions. The original file is never changed.
_Avoid_: Output, decrypted file, unlocked PDF

**Repack**:
The lossless rewrite qpdf does while producing the unlocked copy: object streams, recompressed deflate. Image and font bytes are the same once inflated. Always on, in the same run as the unlock.
_Avoid_: Compress, optimise, shrink

**Outcome**:
How an attempt ends when it is not abandoned: _unlocked_, _not locked_, or _unreadable_.
_Avoid_: Result, status, response

**Not locked**:
The outcome for a PDF with neither an open password nor restrictions; there is nothing to remove.
_Avoid_: Not encrypted, unprotected

**Unreadable**:
The outcome for a file that cannot be parsed as a PDF, or that the device cannot process.
_Avoid_: Error, corrupt, failed
