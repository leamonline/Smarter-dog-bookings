import { PageHeader, PageHeaderAction, PageHeaderPill } from "smarter-dog-ui";

export const WithSubtitleAndActions = () => (
  <PageHeader
    title="Dogs"
    subtitle="248 dogs on file"
    meta={<PageHeaderPill tone="teal" dot>Live</PageHeaderPill>}
    actions={<PageHeaderAction>Add dog</PageHeaderAction>}
  />
);

export const TitleOnly = () => <PageHeader title="Reports" subtitle="This week" />;
