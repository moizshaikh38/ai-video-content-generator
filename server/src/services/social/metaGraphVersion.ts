/** Reviewed November 19, 2026 against Meta's version table and v26 changelog.
 * Uses existing Facebook Login permissions/objects, not Instagram Login scopes.
 * No commerce, ads, legacy root ids/date_format, or retired Page fields are used.
 * Examples on some guides show v27 while the lifecycle table lists v26, so do
 * not infer a newer version from sample URLs. Live qualification is still owed. */
export const META_GRAPH_VERSION='v26.0';
export const META_GRAPH_BASE=`https://graph.facebook.com/${META_GRAPH_VERSION}`;
