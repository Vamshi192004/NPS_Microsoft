# Customer feedback dashboard

A React and Vite dashboard for exploring `Dataset_clean.csv`.

## Pages

- **Overview** shows NPS, response counts, the monthly trend, the promoter/passive/detractor mix, and customer groups with lower NPS.
- **Insights** compares average product activity for Promoters and Detractors and shows the same customer group comparison in more detail.

The filters at the top apply to both pages. Group comparisons are descriptive: they show where scores differ, not what caused the difference. Customer groups are ordered by the NPS gap and their share of responses. The source data covers December 2020 through February 2021.

## Run locally

Requires Node.js and npm.

```powershell
npm install
npm run dev
```

Open the local Vite URL. The dashboard reads `public/Dataset_clean.csv`.
