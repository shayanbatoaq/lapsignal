import { describe,expect,it } from "vitest";
import { formulaValue,sessionTypeValue,teamValue,trackValue } from "../src/protocol/catalogs.js";
describe("F1 2021 identity catalogs",()=>{
 it("maps the documented Baku and Spa track IDs",()=>{
  expect(trackValue(20)).toMatchObject({id:20,name:"Baku",slug:"baku"});
  expect(trackValue(10)).toMatchObject({id:10,name:"Spa-Francorchamps",slug:"spa-francorchamps"});
 });
 it("maps the physical validation context",()=>{expect(teamValue(3).name).toBe("Williams");expect(sessionTypeValue(13).name).toBe("Time Trial");expect(formulaValue(0).name).toBe("F1 Modern")});
 it("preserves unknown IDs honestly",()=>expect(teamValue(255).name).toBe("Unknown team · ID 255"));
});
