// Authentic Simulator recording frames, captured November 7, 2026.
// Provenance and review: docs/deployments/gig-tax-pros-app-screens-20261107.json.
// Captured numbers are synthetic demonstration entries, never customer records.
export const appScreens = [
  {
    id: 'home', src: '/assets/app/home.png', width: 1178, height: 2556,
    label: 'Your day at a glance', topic: 'earnings',
    alt: 'Actual Gig Tax Pros Home screen with trips, expense, income and alerts shortcuts, an empty earnings dashboard and gig app launchers.',
    caption: 'Start with the work you have actually saved. Home brings together estimated net, recorded work time, business miles, your goal and shortcuts to your everyday tools. This fresh preview has no completed work yet, so its totals are zero.',
    tap: 'Open Home. Use Trips, Expense or Income to add records, or Set a goal to choose a target. Scroll the publisher row to reach a work app.',
  },
  {
    id: 'offers', src: '/assets/app/offers.png', width: 1178, height: 2556,
    label: 'Bring an offer into focus', topic: 'offers',
    alt: 'Actual Offers screen with Read an offer and Enter buttons and a synthetic observed DoorDash offer for 30 dollars.',
    caption: 'Use a chosen screenshot or enter the details yourself. The inbox keeps the observed offer separate from actual earnings. This example has a $30 quoted payout; its review prompt tells you to confirm the original offer and any missing information.',
    tap: 'Open Offers, then Read an offer or Enter. Review the saved card before returning to the original work app to make your decision.',
  },
  {
    id: 'offer-detail', src: '/assets/app/offer-detail.png', width: 1178, height: 2556,
    label: 'See what the payout leaves out', topic: 'offers',
    alt: 'Actual offer detail screen showing a 30 dollar demonstration payout, 2 dollars of additional costs, missing vehicle costs and a route-home comparison button.',
    caption: 'Look past the headline payout to vehicle costs, other costs, a planning reserve and time. Here the missing inputs remain blank instead of producing a misleading profit estimate. The $30 payout and $2 cost are demonstration entries.',
    tap: 'Open an offer card. Use Review extracted fields to complete the inputs, or Compare the full route home to consider the onward drive.',
  },
  {
    id: 'job-status', src: '/assets/app/job-status.png', width: 1178, height: 2556,
    label: 'Keep your work status clear', topic: 'offers',
    alt: 'Actual Offers screen showing a driver-reported accepted job, buttons to start, complete or cancel, and a warning against considering the same offer twice.',
    caption: 'After accepting in the original work app, record what happened here. Your reported job status reserves time in the planner and helps flag conflicts. Completing the status still leaves actual earnings and mileage for you to record separately.',
    tap: 'In Offers, update the driver-reported job to started, completed or cancelled. These controls update your own planner; they do not operate the provider app.',
  },
  {
    id: 'alerts', src: '/assets/app/alerts.png', width: 1178, height: 2556,
    label: 'Make recordkeeping a habit', topic: 'trips',
    alt: 'Actual Alerts and reminders screen with an empty alert inbox, Send a trip alert button and Driving and expense reminders settings.',
    caption: 'Choose prompts that help you remember drives and expenses. The empty inbox shown here is ready for your own alerts. Notification and movement permissions are optional, and you choose when to start recording a drive.',
    tap: 'Open Alerts on Home or tap the bell. Choose Driving & expense reminders to review the settings, or send a trip alert to try the prompt.',
  },
];
