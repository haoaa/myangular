## promise
### promise chain 
This is how chained then calls work. Each one creates a new Deferred and, by association, a new
Promise. The new Deferred is independent from the original, but is resolved when the original 
one is resolved.
### how promise work
Defer have a promise inside. Promise call then to add callback to process queue.
Then after Defer call resolve/reject, the process queue execute with value that resolve/reject just pass in.

Although there's more details to cover with, this is basic idea how promise works.  