# Rise V3
Welcome to the third iteration of the RISE CLI. This version marks a significant shift in our approach, aiming to implement RISE with zero dependencies. No node_modules, no third-party libraries - just pure, standalone functionality.

## Why the Change?
Our decision to rebuild RISE from the ground up stems from a recent experience with the AWS SDK. When they deprecated v2 of their library, it forced us to upgrade to v3. This was particularly frustrating because RISE was built on our own 'aws-foundation' library, which wrapped the AWS SDK v2.

The deprecation meant we had to rewrite our aws-foundation library to work with AWS SDK v3, and then update every other part of RISE that depended on it. This cascading effect of changes was time-consuming and unnecessary, especially since we didn't need or want the new features in AWS SDK v3.

This experience led us to rethink our approach. RISE V3 is designed to be a 'build once, use forever' solution. Our goal is to create a robust, self-contained tool that doesn't require constant updates or maintenance due to changes in underlying libraries.

## Our New Approach
While we've eliminated traditional dependencies, RISE V3 does rely on one external component: the AWS CLI. Instead of using the aws-sdk node module or our own wrapper library, we now execute AWS commands via the CLI using the exec command.

Some might view this as a looser, potentially riskier dependency. However, we see it as a strategic choice. By depending on a language-agnostic CLI rather than a rapidly evolving Node package, we gain stability and reduce the likelihood of forced updates in the future.

This new version of RISE represents our commitment to creating a tool that's not just powerful, but also sustainable and low-maintenance. We're excited to offer a solution that can stand the test of time without constant tweaking and updating.

