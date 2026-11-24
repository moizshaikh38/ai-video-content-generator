# Selection pre-provider deletion admission

The actual selector checks the owned project before optional retained-genre
refresh and again before clip-selection prompt/provider work. An already
admitted deletion refuses with PROJECT_DELETION_IN_PROGRESS and a409 response.
Missing owned project refuses404. Read errors remain errors, never permission
to call a provider. Existing active-selection cleanup still runs on refusal.

This is a bounded read preflight, not a lock spanning an external request.
Deletion can race immediately after either check. Optional genre review or
selection work already started cannot be recalled by this guard. The final
transactional deletion/source/context publication fence remains required; this
change does not make every possible provider call impossible during deletion.

Qualification uses the real selector with free retained-genre mode enabled and
a marked synthetic project containing an invalid transcript binding. It must
refuse deletion before the optional refresh could produce a source-review error
or any source/provider work, preserve prior candidates and leave the active set
clear. No real provider/model/source upload is used. No config/live/flag change.
