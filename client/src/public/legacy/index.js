/* Generated public renderer entrypoint. Function registrations intentionally
 * happen before sequential initializers to retain function-declaration hoisting. */
import CM3 from "../../analysis/turkish.js";
import { registerFoundation, initializeFoundation } from "./00-foundation.js";
import { registerEventsAndSources, initializeEventsAndSources } from "./01-events-and-sources.js";
import { registerMapsAndRules, initializeMapsAndRules } from "./02-maps-and-rules.js";
import { registerAnalysisAndFindings, initializeAnalysisAndFindings } from "./03-analysis-and-findings.js";
import { registerPublicRoutes, initializePublicRoutes } from "./04-public-routes.js";
import { registerNarrativeAndAdvanced, initializeNarrativeAndAdvanced } from "./05-narrative-and-advanced.js";
import { registerPresentationAndCorrections, initializePresentationAndCorrections } from "./06-presentation-and-corrections.js";
import { registerHistoricalFeatures, initializeHistoricalFeatures } from "./07-historical-features.js";
import { registerHistoricalV3, initializeHistoricalV3 } from "./08-historical-v3.js";

export function mountLegacyRenderer(runtime) {
  runtime.CM3 = CM3;
  runtime.window.CM3 = CM3;
  runtime.window.DATA = runtime.data;
  registerFoundation(runtime);
  registerEventsAndSources(runtime);
  registerMapsAndRules(runtime);
  registerAnalysisAndFindings(runtime);
  registerPublicRoutes(runtime);
  registerNarrativeAndAdvanced(runtime);
  registerPresentationAndCorrections(runtime);
  registerHistoricalFeatures(runtime);
  registerHistoricalV3(runtime);
  runtime.initializeBindings(["D", "$", "el", "esc", "pct", "SRC", "ART", "BIA", "FRM", "REG", "POL", "DAYS", "STAT", "LIVE", "BANDS", "bandOf", "SECT", "MON", "fmtD", "fmtDT", "VERT", "FRAG", "CFG", "acid", "TIP", "NS", "G4", "SECTIONS", "DETAIL", "ADMIN", "EVVIEW", "POLARFIT", "QKEY", "MAPFILTER", "PCAX", "RULEDEF", "WEIGHTS", "ATL", "AXES6", "NARRVIEW", "EXPKEY", "EXPQ", "BTIER", "NDIMS", "UNSET", "BLOCL", "ACC", "ABL", "DAT", "HARM", "VALUES", "FINDINGS", "BREG", "TIERL", "MODAL", "CMPDIMS", "EV", "TPX", "V2", "SIDE", "BRIEFDAY", "FEEDVIEW", "FEEDN", "BSSIDE", "OWNTYPE", "OWNCOL", "ARTSIDE", "ARTSORT", "NW", "NBYEV", "NARRW", "NFOC", "NCUR", "NDL", "NORD", "NPAL", "XTICK", "ADV", "DDEFS", "V1URL", "LOGO", "NAV", "SUB", "DETAILP", "TRSTOP", "SPLITPAIR", "FIRSTBY", "V3", "V3_KIND", "V3_FAM", "V3_FAMS", "V3_BLOC_KEY", "V3_GRADE", "V3_RULE", "V3FX", "V3_COLL", "V3_NOTE"]);
  initializeFoundation(runtime);
  initializeEventsAndSources(runtime);
  initializeMapsAndRules(runtime);
  initializeAnalysisAndFindings(runtime);
  initializePublicRoutes(runtime);
  initializeNarrativeAndAdvanced(runtime);
  initializePresentationAndCorrections(runtime);
  initializeHistoricalFeatures(runtime);
  initializeHistoricalV3(runtime);
  runtime.installPublicOverrides();
  return runtime;
}
