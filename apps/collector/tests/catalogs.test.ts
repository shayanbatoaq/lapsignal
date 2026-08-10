import { describe,expect,it } from "vitest";
import { formulaValue,sessionTypeValue,teamValue,trackValue } from "../src/protocol/catalogs.js";
describe("F1 2021 identity catalogs",()=>{
 it("maps the physical validation context",()=>{expect(trackValue(10).name).toBe("Spa-Francorchamps");expect(teamValue(3).name).toBe("Williams");expect(sessionTypeValue(13).name).toBe("Time Trial");expect(formulaValue(0).name).toBe("F1 Modern")});
 it("preserves unknown IDs honestly",()=>expect(teamValue(255).name).toBe("Unknown team · ID 255"));
});
