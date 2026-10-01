# Microsoft Teams NPS: EDA and Action Plan

## 1. Executive summary

The workbook contains a main `Data` sheet with **31,469 feedback records and 27 meaningful fields**. It covers feedback submitted from **1 December 2020 through 28 February 2021**, with a seven-day behavioral lookback before each response.

Using the standard formula:

$$NPS = 100 \times \frac{Promoters - Detractors}{Total\ responses}$$

- Promoters: **13,756 (43.7%)**
- Passives: **9,032 (28.7%)**
- Detractors: **8,681 (27.6%)**
- Overall NPS: **+16.13**

The strongest immediate signal is not a single product feature. It is that detractors were, on average, more active than promoters in the preceding week. This is a small effect and should be treated as a prioritization hypothesis: highly engaged customers may encounter more friction simply because they use more of Teams. Geography and customer context show much larger descriptive variation and should be investigated before product decisions are made.

The workbook is useful for behavioral and segmentation EDA, but it does **not** contain written comments, explicit feature satisfaction scores, incident data, latency, crash data, or experiment assignments. Therefore, it can identify *where and for whom* NPS differs, but not yet explain the exact customer pain point or prove that changing a behavior will improve NPS.

## 2. What is in the data

### Outcome fields

- `Feedback_Rating`: 0–10 NPS rating.
- `ResponseType`: Promoter, Passive, or Detractor.
- `Feedback_DateTime` and `Feedback_Month`: response timing.

`ResponseType` is effectively derived from the rating: detractors are ratings 0–6, passives 7–8, and promoters 9–10. Do not use both as independent model predictors; using `Feedback_Rating` to predict `ResponseType` is target leakage.

### User behavior in the previous week

- Overall activity: `ActiveEvents`, `CollabEvents`, `ReadEvents`.
- Client activity: `MobileEvents`, `DesktopEvents`, `WebEvents`.
- Creation activity: chat, channel, file, calling/meeting, and app/platform events.
- Collaboration footprint: `ActiveChannels`, `ActiveTeams`.

### Context and segmentation

- User geography: `PipelineInfo_ClientCountry`.
- Tenant geography: `Tenant_Country`.
- Industry: `Tenant_MSSalesVerticalName`.
- Customer segment: `Tenant_CustomerSegmentGroup`.
- Tenure proxy: `NewUser_Period` and `FirstSeenTime_Date`.
- Device context: CPU cores, CPU speed, and CPU architecture.

## 3. Data-quality findings

| Area | Finding | Recommended treatment |
|---|---|---|
| Empty columns | `Unnamed: 27`–`61`, `Unnamed: 64`–`66` are completely empty. | Remove from analysis. |
| Sparse export fields | `Unnamed: 67`–`70` contain only 14–15 values and appear to be pivot/export artifacts. | Exclude unless their origin is confirmed. |
| Duplicate fields | `PipelineInfo_ClientCountry.1` and `Tenant_Country.1` duplicate the corresponding country fields. | Compare once, then retain one canonical copy. |
| CPU architecture | Missing for **31,389 of 31,469 (99.75%)**. | Drop from modeling or treat as unavailable; do not impute. |
| CPU cores/speed | Missing for **5.36%** and **5.45%**, respectively. | Add missingness flags; use median/robust imputation only for modeling. |
| Tenant attributes | Country missing **0.58%**; industry and segment missing **0.80%** each. | Keep an explicit `Unknown` category and report coverage. |
| Client country | Missing **21 rows (0.07%)**. | Keep as `Unknown`. |
| Duplicate records | No fully duplicated rows were found. | Still validate whether one user or tenant can submit multiple responses. |
| Date integrity | There are 31,469 rows but only 31,280 unique feedback timestamps. | Check timestamp precision, repeated submissions, and survey retry behavior. |

Also validate impossible values: non-negative event counts, rating in 0–10, valid country codes, and whether the event totals are logically consistent with their component events.

## 4. Initial EDA findings

### Time

NPS by month:

| Month | Responses | NPS |
|---:|---:|---:|
| December | 10,757 | +16.58 |
| January | 11,004 | +18.18 |
| February | 9,708 | +13.29 |

February is a warning signal: it has the lowest NPS and should be checked against releases, outages, support incidents, client mix, and survey-channel changes. The three-month window is too short to infer a durable trend.

### Behavior: promoter versus detractor averages

| Metric | Promoter mean | Detractor mean | Difference (P − D) |
|---|---:|---:|---:|
| Active events | 1,099.9 | 1,216.6 | -116.8 |
| Collaboration events | 150.7 | 171.7 | -21.0 |
| Read events | 408.5 | 464.4 | -55.8 |
| Desktop events | 1,010.8 | 1,117.6 | -106.7 |
| Mobile events | 81.9 | 89.1 | -7.2 |
| Chat creation | 128.4 | 148.1 | -19.8 |
| Active channels | 2.05 | 2.32 | -0.27 |
| Active teams | 1.50 | 1.61 | -0.11 |

Spearman correlations with rating are small: `ActiveEvents` **-0.041**, `ReadEvents` **-0.033**, `DesktopEvents` **-0.040**, and `ActiveChannels` **-0.057**. These are associations, not evidence that activity causes dissatisfaction. Check nonlinear effects, outliers, and confounding by country, segment, and tenant.

### Geography and customer context

Examples of sufficiently large groups:

- Tenant country: Japan NPS **-14.67** versus Mexico **+49.06**, Brazil **+31.13**, and Canada **+21.84**.
- Customer segment: EDU **+22.17**, Enterprise **+16.12**, SMC-Corporate **+16.32**, and SMC-SMB **+12.54**.
- Industry: High Tech & Electronics **+6.02**, Communications/Network Service Providers **+5.52**, and Banking **+21.62**.

These differences may reflect language, network quality, product mix, support experience, sampling, response propensity, or small-group noise. Always show group size and confidence intervals. Do not rank a group on NPS alone.

## 5. Recommended EDA workflow

1. **Prepare the analytical table.** Remove empty/pivot columns, resolve duplicate country fields, parse dates, standardize categories, and create an `Unknown` level.
2. **Validate the outcome.** Recalculate `ResponseType` from `Feedback_Rating` and investigate any mismatch. Report counts, response mix, NPS, and confidence intervals.
3. **Check sampling.** Measure responses per user, tenant, country, month, and day. A few tenants or countries may dominate the result.
4. **Explore distributions.** Use log transforms or percentile bins for event counts; inspect zero-inflation and extreme values.
5. **Compare groups fairly.** Use minimum sample thresholds, bootstrap confidence intervals, and multiple-testing correction for many country/industry comparisons.
6. **Model promoter versus detractor.** Start with logistic regression for interpretability; then compare with a tree-based model for nonlinearities. Exclude rating and response type from predictors.
7. **Control for confounding.** Include month, country, segment, industry, tenure, and client mix. Cluster standard errors or use tenant-level splits where appropriate.
8. **Validate out of time.** Train on earlier feedback and test on the latest period. Report AUC, calibration, lift, and subgroup performance, not just accuracy.
9. **Translate to decisions.** Combine model importance, effect size, reach, confidence, and intervention feasibility into a priority score.

## 6. How to identify the real pain points

This file identifies behavioral correlates, not stated reasons. Add or join:

- Open-ended NPS comments and contact-reason taxonomy.
- Feature-level satisfaction questions.
- Crash, latency, call-quality, join-failure, and error telemetry.
- Release, incident, client version, operating system, network, and locale.
- Support contacts, resolution time, and escalation history.
- Survey exposure and response-channel metadata.

Use text analytics to classify comments into themes such as reliability, audio/video quality, performance, messaging, meetings, file collaboration, search, notifications, and administration. Link each theme to NPS, affected segments, frequency, severity, and telemetry evidence.

## 7. Solution for the Microsoft Teams Quality and Customer Satisfaction team

### Phase 1: Establish the baseline

Publish a governed NPS dashboard with overall NPS, promoter/passive/detractor mix, monthly trend, response volume, confidence intervals, and drill-downs by country, segment, industry, tenure, client, and product area. Add data-quality coverage and sampling warnings to prevent misleading rankings.

### Phase 2: Find and rank drivers

Create a driver table with these columns:

`Driver | Direction | Effect size | Reach | NPS opportunity | Confidence | Segment concentration | Owner | Feasibility`

Prioritize drivers using an opportunity score such as:

$$Opportunity = Reach \times Expected\ NPS\ improvement \times Confidence$$

A low-frequency issue with a large effect may be important for a strategic segment, while a moderate issue affecting most customers may produce more total NPS improvement. Keep both views.

### Phase 3: Intervene

For each high-confidence driver, define a product or service intervention, for example performance optimization for affected device/client cohorts, reliability fixes for incident-linked detractors, improved onboarding for new users, or targeted support for high-risk enterprise groups. Do not prescribe a feature fix from this workbook alone; confirm the hypothesis with comments and telemetry first.

### Phase 4: Prove impact

Use randomized experiments where possible. Otherwise use a matched pre/post design or difference-in-differences with a comparison group. Track NPS, detractor rate, task success, reliability, usage, support contacts, and guardrail metrics. Measure impact by country, client, segment, and tenure so an overall improvement does not hide harm to a subgroup.

### Phase 5: Close the loop

Contact detractors with a structured reason capture, route actionable issues to the responsible product owner, and track whether the customer’s next response improves. Re-run the driver analysis monthly and maintain a decision log linking each intervention to evidence and measured outcome.

## 8. Key conclusions

- Current baseline NPS is **+16.13**, with a sizeable passive population (**28.7%**) that may be the easiest conversion opportunity.
- Activity is not a simple proxy for satisfaction; detractors are slightly more active, so investigate friction during high-use workflows.
- Country, industry, segment, and February timing are promising investigation areas, but descriptive NPS gaps are not causal findings.
- The biggest analytical gap is the absence of customer verbatims and product-quality telemetry.
- The credible Mu Sigma proposition is an evidence-to-action system: clean the data, identify robust drivers, connect them to pain-point and telemetry evidence, prioritize by reach and impact, and validate improvements experimentally.
