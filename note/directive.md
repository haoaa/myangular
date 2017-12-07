## directive
### DOM Compilation and Basic Directives
- To alter an existing directive you’ll need to use a decorator.

### Priority
Priorities are numeric, and a larger number means higher priority - i.e.   
for compilation, directives are sorted in descending order by priority.

### attr observing
Because of the way we constructed the attributes object, 
the same exact object(Attributes) is shared by all the directives of an element: 