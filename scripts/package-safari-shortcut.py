#!/usr/bin/env python3
"""Build inspectable, unsigned Apple Shortcuts packages. No network or credentials."""
import copy
import hashlib
import json
import plistlib
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.local' / 'shortcut-packages'
NS = uuid.UUID('34c1e37a-7055-4e7d-a79c-a92402475016')
ALERTS = json.loads((ROOT / 'src' / 'shortcut' / 'alerts.json').read_text())


def identifier(label):
    return str(uuid.uuid5(NS, label)).upper()
def ref(output, name):
    return {'Value': {'Type': 'ActionOutput', 'OutputUUID': output, 'OutputName': name}, 'WFSerializationType': 'WFTextTokenAttachment'}
def action(name, **params):
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.' + name, 'WFWorkflowActionParameters': params}
def text_token(reference, prefix=''):
    position = len(prefix.encode('utf-16-le')) // 2
    return {
        'Value': {'string': prefix + '\uFFFC', 'attachmentsByRange': {f'{{{position}, 1}}': reference['Value']}},
        'WFSerializationType': 'WFTextTokenString',
    }
def text_parts(*parts):
    text = ''
    attachments = {}
    for part in parts:
        if isinstance(part, str):
            text += part
        else:
            position = len(text.encode('utf-16-le')) // 2
            attachments[f'{{{position}, 1}}'] = part['Value']
            text += '\uFFFC'
    return {'Value': {'string':text,'attachmentsByRange':attachments},'WFSerializationType':'WFTextTokenString'}
def iso_date_token(reference):
    formatted = copy.deepcopy(reference)
    formatted['Value']['Aggrandizements'] = [{
        'Type':'WFDateFormatVariableAggrandizement',
        'WFDateFormatStyle':'ISO 8601',
        'WFISO8601IncludeTime':True,
    }]
    return text_token(formatted)

def package(script, variant, alert=None):
    alert = alert or {'id': 'none', 'label': '无', 'alertTime': None}
    keys = ['javascript','text-result','dictionary','events','summary','planned-count','calendar-name','calendar-name-pattern','existing','existing-count','calendar','if-calendar','created','if-created','count','error','if-events','if-existing','repeat']
    keys += ['existing-' + key for key in ['repeat','detail','match','if-match','event','verified']]
    ids = {key: identifier(variant + '-v14-' + key) for key in keys}
    value = lambda key, name: ref(ids[key], name)
    result = value('javascript', '网页脚本结果')
    contents = value('text-result', '课表 JSON')
    dictionary = value('dictionary', '课表数据')
    events = value('events', '课程列表')
    summary = value('summary', '添加摘要')
    name = value('calendar-name', '课表日历名称')
    pattern = value('calendar-name-pattern', '课表日历名称匹配规则')
    calendar = value('calendar', '新建的课表日历')
    repeat_item = {'Value': {'Type': 'Variable', 'VariableName': 'Repeat Item'}, 'WFSerializationType': 'WFTextTokenAttachment'}
    def get(key, output, source=dictionary):
        return action('getvalueforkey', UUID=ids[output], WFGetDictionaryValueType='Value', WFDictionaryKey=key, WFInput=source)
    def branch(group, mode, input_value=None):
        parameters = {'GroupingIdentifier':ids[group], 'WFControlFlowMode':mode}
        if input_value is not None:
            parameters.update(WFCondition=100, WFInput={'Type':'Variable','Variable':input_value})
        return action('conditional', **parameters)
    def positive_count(group, source):
        result = positive = branch(group, 0, source)
        positive['WFWorkflowActionParameters'].update(WFCondition=2, WFNumberValue=0)
        return result
    def verify_named_calendar(stage):
        # The native search is only a candidate query. Confirm that the found
        # event actually belongs to a calendar with the expected name.
        return [
            action('repeat.each', GroupingIdentifier=ids[stage + '-repeat'], WFControlFlowMode=0, WFInput=value(stage,'候选日程')),
            action('properties.calendarevents', UUID=ids[stage + '-detail'], WFContentItemPropertyName='Calendar', WFInput=repeat_item),
            action('text.match', UUID=ids[stage + '-match'], text=text_token(value(stage + '-detail','日程所在日历')), WFMatchTextPattern=text_token(pattern), WFMatchTextCaseSensitive=True),
            branch(stage + '-if-match',0,value(stage + '-match','匹配的课表日历名称')),
            action('getitemfromlist', UUID=ids[stage + '-event'], WFInput=repeat_item, WFItemSpecifier='First Item'),
            branch(stage + '-if-match',1),
            action('nothing'),
            branch(stage + '-if-match',2),
            action('repeat.each', UUID=ids[stage + '-verified'], GroupingIdentifier=ids[stage + '-repeat'], WFControlFlowMode=2),
        ]
    actions = [
        action('comment', WFCommentActionText='应大通课表直接添加 v14\n从信息门户进入学校课表后，通过 Safari 分享菜单运行。确认后新建独立日历并批量添加。导航修复开启时，在每个日程地址末尾追加“ 应急管理大学”。添加前检测是否已存在同名课表日历；提醒时间由安装的版本决定（默认无提醒）。只读取学校课表和已有课表日历，不读取密码或 Cookie，不向服务器回传数据。'),
        action('runjavascriptonwebpage', UUID=ids['javascript'], WFJavaScript=script, WFInput={'Value':{'Type':'ExtensionInput'},'WFSerializationType':'WFTextTokenAttachment'}),
        action('gettext', UUID=ids['text-result'], WFTextActionText=text_token(result)),
        action('detect.dictionary', UUID=ids['dictionary'], WFInput=contents),
        get('events','events'),
        branch('if-events',0,events),
        get('summary','summary'), get('count','planned-count'), get('calendarName','calendar-name'), get('calendarNamePattern','calendar-name-pattern'),
        action('filter.calendarevents', UUID=ids['existing'], WFContentItemFilter={
            'Value': {'WFActionParameterFilterPrefix':1,'WFActionParameterFilterTemplates':[
                {'Operator':4,'Property':'Calendar','Removable':True,'Values':{'Enumeration':{'Value':name,'WFSerializationType':'WFStringSubstitutableState'}}}
            ],'WFContentPredicateBoundedDate':False}, 'WFSerializationType':'WFContentPredicateTableTemplate'
        }, WFContentItemInputParameter='Library', WFContentItemLimitEnabled=True, WFContentItemLimitNumber=1),
        *verify_named_calendar('existing'),
        action('count', UUID=ids['existing-count'], Input=value('existing-verified','已核验的同名课表日程'), WFCountType='Items'),
        positive_count('if-existing',value('existing-count','同名课表数量')),
        action('alert', WFAlertActionTitle='已存在同名课表日历 · v14', WFAlertActionMessage=text_parts('已存在同名课表日历：\n',name,'\n\n为避免重复，本次没有创建日历或添加课程。'), WFAlertActionCancelButtonShown=False),
        branch('if-existing',1),
        action('alert', WFAlertActionTitle='确认添加课表', WFAlertActionMessage=text_token(summary), WFAlertActionCancelButtonShown=True),
        action('addnewcalendar', UUID=ids['calendar'], CalendarName=text_token(name)),
        branch('if-calendar',0,calendar),
        action('repeat.each', GroupingIdentifier=ids['repeat'], WFControlFlowMode=0, WFInput=events),
    ]
    fields = {}
    field_keys = ['title','start','end','location','notes']
    if alert.get('alertTime') == 'Custom':
        field_keys.append('alert')
    for key in field_keys:
        field_id = identifier(variant + '-v14-event-' + key)
        fields[key] = ref(field_id, '课程' + key)
        actions.append(action('getvalueforkey', UUID=field_id, WFGetDictionaryValueType='Value', WFDictionaryKey=key, WFInput=repeat_item))
    start = identifier(variant + '-v14-start-date')
    end = identifier(variant + '-v14-end-date')
    event_params = {
        'WFCalendarItemTitle': text_token(fields['title']),
        'WFCalendarItemLocation': text_token(fields['location']),
        'WFCalendarDescriptor': calendar,
        'WFCalendarItemStartDate': iso_date_token(ref(start,'开始时间')),
        'WFCalendarItemEndDate': iso_date_token(ref(end,'结束时间')),
        'WFCalendarItemAllDay': False,
        'WFCalendarItemNotes': text_token(fields['notes']),
        'ShowWhenRun': False,
    }
    if alert.get('alertTime'):
        event_params['WFAlertTime'] = alert['alertTime']
        if alert['alertTime'] == 'Custom':
            event_params['WFAlertCustomTime'] = text_token(fields['alert'])
    actions += [
        action('date', UUID=start, WFDateActionMode='Specified Date', WFDateActionDate=text_token(fields['start'])),
        action('date', UUID=end, WFDateActionMode='Specified Date', WFDateActionDate=text_token(fields['end'])),
        action('addnewevent', **event_params),
        action('repeat.each', UUID=ids['created'], GroupingIdentifier=ids['repeat'], WFControlFlowMode=2),
        action('count', UUID=ids['count'], Input=value('created','本次添加动作返回的日程'), WFCountType='Items'),
        positive_count('if-created',value('count','本次添加数量')),
        action('alert', WFAlertActionTitle='课表添加结果', WFAlertActionMessage=text_parts('日历：',name,'\n计划课程次数：',value('planned-count','计划数量'),'\n本次添加日程：',value('count','本次添加数量'),'\n\n数量来自本次添加动作返回的日程。'), WFAlertActionCancelButtonShown=False),
        action('openapp', WFSelectedApp={'BundleIdentifier':'com.apple.mobilecal','Name':'Calendar'}),
        branch('if-created',1),
        action('alert', WFAlertActionTitle='未取得添加结果', WFAlertActionMessage='添加动作没有返回日程结果，请在日历 App 检查本次生成的课表日历。', WFAlertActionCancelButtonShown=False),
        branch('if-created',2),
        branch('if-calendar',1),
        action('alert', WFAlertActionTitle='未取得新建的课表日历', WFAlertActionMessage='系统没有返回新建的日历对象，未继续添加课程。请检查日历账户和权限后再试。', WFAlertActionCancelButtonShown=False),
        branch('if-calendar',2),
        branch('if-existing',2),
        branch('if-events',1),
        get('error','error'),
        action('alert', WFAlertActionTitle='课表读取未完成 · v14', WFAlertActionMessage=text_token(value('error','错误原因'),'未添加任何日程。具体原因：\n\n'), WFAlertActionCancelButtonShown=False),
        branch('if-events',2),
    ]
    return {
        'WFWorkflowName': '应大通课表导出',
        'WFWorkflowClientVersion': '3036.0.6',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor':4251333119,'WFWorkflowIconGlyphNumber':59481},
        'WFWorkflowTypes': ['ActionExtension'],
        'WFWorkflowInputContentItemClasses': ['WFSafariWebPageContentItem'],
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasShortcutInputVariables':True,
        'WFWorkflowImportQuestions':[], 'WFQuickActionSurfaces':[],
        'WFWorkflowActions':actions,
    }

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    summaries = []
    for variant in ['default', 'apple-maps']:
        script = (ROOT / 'src' / 'generated' / f'safari-{variant}.js').read_text()
        for alert in ALERTS:
            obj = package(script, variant, alert)
            xml = plistlib.dumps(obj, fmt=plistlib.FMT_XML, sort_keys=False)
            unsigned = f'safari-{variant}-{alert["id"]}.unsigned.shortcut'
            (OUT / unsigned).write_bytes(xml)
            summaries.append({'variant': variant, 'alert': alert['id'], 'name': obj['WFWorkflowName'], 'actions': len(obj['WFWorkflowActions']), 'scriptSha256': hashlib.sha256(script.encode()).hexdigest(), 'unsignedSha256': hashlib.sha256(xml).hexdigest(), 'unsigned': unsigned})
    (OUT / 'unsigned-manifest.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2))
    print(f'{len(summaries)} unsigned packages written to {OUT}')
