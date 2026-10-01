# Microsoft Teams NPS Analysis

This project explores Microsoft Teams customer feedback from December 2020 through February 2021. It includes data cleaning and exploratory analysis notebooks, a written summary of findings, and a React dashboard for filtering NPS results.

## Project contents

- `Data_understanding_and_cleaning.ipynb`, `datacleaning.ipynb`, and `EDA.ipynb`: data preparation and exploratory analysis.
- `NPS_Analysis_and_Solution.md`: analysis findings, limitations, and recommended follow-up.
- `nps-dashboard/`: React and Vite dashboard source.

## Dashboard setup

Requires Node.js and npm. The source data is not included in this repository. Obtain an authorized copy of `Teams_NPS_Cleaned_Imputed1.csv` and place it in `nps-dashboard/public/` before starting the dashboard.

```powershell
cd nps-dashboard
npm ci
npm run dev
```

Open the local URL printed by Vite. To create a production build, run `npm run build` from `nps-dashboard`.

## Analysis notebooks

The notebooks require the original or cleaned input data files. Those files are excluded from this repository; update the notebook data paths to match your local copies before running them. Do not commit datasets containing customer or tenant information.

## NPS definition

NPS is calculated as the percentage of Promoters (ratings 9–10) minus the percentage of Detractors (ratings 0–6). Passives (ratings 7–8) count in the response total but not in either group.

The analysis is descriptive. Differences between customer groups do not establish causes, and the available data does not include written feedback or incident details.
