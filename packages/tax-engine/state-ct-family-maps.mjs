// Original Connecticut DRS annual blanks. Coordinates are PDF points from top-left.
export const ctEitcTemplates=Object.freeze({"2023":{"id":"ct1040eitc","year":2023,"title":"2023 Connecticut Earned Income Tax Credit","url":"https://portal.ct.gov/-/media/drs/forms/2023/income/schedule-ct-eitc_1223.pdf","sha256":"04a43c50bb4dacf008561937d2b8265538eb2edbed91492c324a81f5094be968","bytes":251092,"pages":2,"fieldCount":0,"overlay":true,"sourceDraft":false},"2024":{"id":"ct1040eitc","year":2024,"title":"2024 Connecticut Earned Income Tax Credit","url":"https://portal.ct.gov/-/media/drs/forms/2024/income/schedule-ct-eitc_1224.pdf","sha256":"5511c1c374d0d0fddddd2a24b8a2940f0194105f8c1e972ce7f766124efdf2ca","bytes":251797,"pages":2,"fieldCount":0,"overlay":true,"sourceDraft":false},"2025":{"id":"ct1040eitc","year":2025,"title":"2025 Connecticut Earned Income Tax Credit","url":"https://portal.ct.gov/-/media/drs/forms/2025/income/schedule-ct-eitc_1225.pdf","sha256":"79d54adb622d36651adee69d0148cc98d1b3c1a463b0b5b86b4553737a7d3c45","bytes":227894,"pages":2,"fieldCount":0,"overlay":true,"sourceDraft":false}});
export const ctDependentTemplates=Object.freeze({"2023":{"id":"ctdependent","year":2023,"title":"2023 Connecticut Resident Dependent Information","url":"https://portal.ct.gov/-/media/drs/forms/2023/income/schedule-ct-dependent_1223.pdf","sha256":"fc39205168dd315f23cad66ce5ecaa7296f90483f1140a701c140f2766f66680","bytes":151220,"pages":1,"fieldCount":0,"overlay":true,"sourceDraft":false},"2024":{"id":"ctdependent","year":2024,"title":"2024 Connecticut Resident Dependent Information","url":"https://portal.ct.gov/-/media/drs/forms/2024/income/schedule-ct-dependent_1224.pdf","sha256":"5c825c7649db279e23dcc720f50ea7482160bd5768c7f1415607f04514beeaa5","bytes":150654,"pages":1,"fieldCount":0,"overlay":true,"sourceDraft":false},"2025":{"id":"ctdependent","year":2025,"title":"2025 Connecticut Resident Dependent Information","url":"https://portal.ct.gov/-/media/drs/forms/2025/income/schedule-ct-dependent_1225.pdf","sha256":"2278c6c621c6dd84caeb80b9e7fd2d7118a9c69189bd758f739049af38274ca0","bytes":152264,"pages":1,"fieldCount":0,"overlay":true,"sourceDraft":false}});
const box=(page,x,top,width,height=14)=>({page,x,top,width,height});
const amount=top=>box(1,435,top,116,16);
export const ctEitcLineMaps=Object.freeze({
 2023:{'8':amount(397.12),'10':amount(448),'12':amount(527.62),'13':amount(577.07),'15':amount(633.04),'16':amount(682.58)},
 2024:{'8':amount(397.12),'10':amount(448),'12':amount(527.62),'13':amount(577.07),'15':amount(633.04),'16':amount(682.58)},
 2025:{'8':amount(386.12),'10':amount(437),'12':amount(516.62),'13':amount(566.07),'15':amount(622.04),'15a':amount(647.58),'16':amount(703.40)},
});
// Page 1 and source rows have identical geometry on all three reviewed originals.
export const ctEitcQuestions=Object.freeze({
 federalCreditClaimed:[box(0,298.70,162.96,10.8,14.4),box(0,349.82,162.98,10.8,14.4)],
 investmentOverLimit:[box(0,256.82,183.84,10.8,14.4),box(0,464.73,183.84,10.8,14.4)],
 alreadyFiled:[box(0,407.87,204.58,10.8,14.4),box(0,457.55,204.58,10.8,14.4)],
 qualifyingChildren:[box(0,330.22,235.39,10.8,14.4),box(0,445.50,235.39,10.8,14.4)],
 wagesWithoutCtWithholding:[box(1,331.35,88.53,10.8,14.4),box(1,391.83,88.53,10.8,14.4)],
 selfEmployed:[box(1,401.60,234.50,10.8,14.4),box(1,466.88,234.50,10.8,14.4)],
});
export const ctEitcChildren=Object.freeze([
 {nameTop:299.12,firstX:107.94,middleX:286.38,lastX:329.70,detailTop:327.81,ssnX:58.17,birthX:215.07,relationX:272.53,monthsX:464.56,studentX:435.98,studentTop:349.85,disabledX:435.98,disabledTop:369.07},
 {nameTop:427.54,firstX:110.03,middleX:288.47,lastX:331.79,detailTop:456.04,ssnX:60.26,birthX:217.16,relationX:274.62,monthsX:466.71,studentX:435.44,studentTop:476.35,disabledX:435.44,disabledTop:495.57},
 {nameTop:552.60,firstX:110.03,middleX:288.47,lastX:331.79,detailTop:581.10,ssnX:60.26,birthX:217.16,relationX:274.62,monthsX:466.71,studentX:438.48,studentTop:604.85,disabledX:438.48,disabledTop:624.08},
]);
