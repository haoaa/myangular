## scope
### how digest work with watchFn & listenFn
- In every digest loop it'll evaluate watchFn populate new value then compare with the old one.  
if watch expression's result have changed, call the listenFn.