## Code Commenting Best Practices

### ⛔ ABSOLUTELY NO RUBYDOC - ZERO TOLERANCE ⛔

**NEVER, UNDER ANY CIRCUMSTANCES, add RubyDoc-style comments:**
- ❌ NO `@param` annotations
- ❌ NO `@return` annotations
- ❌ NO `@example` annotations
- ❌ NO method description blocks
- ❌ NO class description headers
- ❌ NO "This method does..." comments
- ❌ NO "Returns..." comments
- ❌ NO parameter explanations
- ❌ NO return value documentation

**Code is self-documenting. Use clear method names instead.**

### OTHER STRICTLY PROHIBITED COMMENTS

- **NO "what" comments**: NEVER explain what code does (code should be self-documenting)
- **NO method/class headers**: NEVER add documentation blocks explaining classes or methods
- **NO obvious comments**: NEVER state the obvious (e.g., "Create user" above User.create)
- **NO temporary comments**: NEVER comment on changes, fixes, or temporary states

### PERMITTED (Rare Exceptions)

- **WHY comments only**: Explain business logic reasoning, NEVER what code does
- **Complex business rules**: When business context isn't obvious from well-named code
- **Workarounds**: Explain unexpected solutions with issue tracker references
- **TODO/FIXME**: With issue numbers and business context

### Self-Documenting Code Requirements

- **Clear naming**: Method, class, and variable names that reveal intent
- **SOLID principles**: Well-structured code eliminates need for explanatory comments
- **Extract methods**: Break complex logic into well-named private methods
- **Small methods**: Each method has single, clear responsibility

### Decision Rule

**If you think code needs a comment, refactor it first.**

See [/docs/CODE_DOCUMENTATION_POLICY.md](/docs/CODE_DOCUMENTATION_POLICY.md) for detailed policy and examples.
