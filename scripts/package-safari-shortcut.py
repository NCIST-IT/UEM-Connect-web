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

def package(script, variant):
    keys = ['javascript','text-result','dictionary','events','summary','planned-count','calendar-name','term-marker','marker-pattern','existing','existing-count','calendar','if-calendar','created','saved','if-saved','count','first-event','error','if-events','if-existing','repeat']
    for stage in ['existing', 'saved']:
        keys += [stage + '-' + key for key in ['repeat','notes','match','if-match','event','verified']]
    ids = {key: identifier(variant + '-v9-' + key) for key in keys}
    value = lambda key, name: ref(ids[key], name)
    result = value('javascript', '网页脚本结果')
    contents = value('text-result', '课表 JSON')
    dictionary = value('dictionary', '课表数据')
    events = value('events', '课程列表')
    summary = value('summary', '添加摘要')
    name = value('calendar-name', '课表日历名称')
    marker = value('term-marker', '本学期课表标记')
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
        result = branch(group, 0, source)
        result['WFWorkflowActionParameters'].update(WFCondition=2, WFNumberValue=0)
        return result
    def verify_events(stage):
        # Native search is only a candidate query. Confirm an exact marker line
        # in each event's actual Notes before treating it as an imported course.
        return [
            action('repeat.each', GroupingIdentifier=ids[stage + '-repeat'], WFControlFlowMode=0, WFInput=value(stage,'候选日程')),
            action('properties.calendarevents', UUID=ids[stage + '-notes'], WFContentItemPropertyName='Notes', WFInput=repeat_item),
            action('text.match', UUID=ids[stage + '-match'], text=text_token(value(stage + '-notes','日程备注')), WFMatchTextPattern=text_token(value('marker-pattern','完整学期标记匹配规则')), WFMatchTextCaseSensitive=True),
            branch(stage + '-if-match',0,value(stage + '-match','匹配的学期标记')),
            action('getitemfromlist', UUID=ids[stage + '-event'], WFInput=repeat_item, WFItemSpecifier='First Item'),
            branch(stage + '-if-match',1),
            action('nothing'),
            branch(stage + '-if-match',2),
            action('repeat.each', UUID=ids[stage + '-verified'], GroupingIdentifier=ids[stage + '-repeat'], WFControlFlowMode=2),
        ]
    actions = [
        action('comment', WFCommentActionText='应大通课表直接添加 v9\n从信息门户进入学校课表后，通过 Safari 分享菜单运行。确认后新建独立日历并批量添加。防重逐条核验日程备注中的完整学期标记，再判断匹配数量。只读取学校课表和已有的应大通学期标记，不读取密码或 Cookie，不向服务器回传数据。'),
        action('runjavascriptonwebpage', UUID=ids['javascript'], WFJavaScript=script, WFInput={'Value':{'Type':'ExtensionInput'},'WFSerializationType':'WFTextTokenAttachment'}),
        action('gettext', UUID=ids['text-result'], WFTextActionText=text_token(result)),
        action('detect.dictionary', UUID=ids['dictionary'], WFInput=contents),
        get('events','events'),
        branch('if-events',0,events),
        get('summary','summary'), get('count','planned-count'), get('calendarName','calendar-name'), get('groupMarker','term-marker'), get('groupMarkerPattern','marker-pattern'),
        action('filter.calendarevents', UUID=ids['existing'], WFContentItemFilter={
            'Value': {'WFActionParameterFilterPrefix':1,'WFActionParameterFilterTemplates':[
                {'Operator':99,'Property':'Notes','Removable':True,'Values':{'String':text_token(marker)}}
            ],'WFContentPredicateBoundedDate':False}, 'WFSerializationType':'WFContentPredicateTableTemplate'
        }, WFContentItemInputParameter='Library', WFContentItemLimitEnabled=False),
        *verify_events('existing'),
        action('count', UUID=ids['existing-count'], Input=value('existing-verified','已核验的已有课表日程'), WFCountType='Items'),
        positive_count('if-existing',value('existing-count','已有课表数量')),
        action('alert', WFAlertActionTitle='此学期已有应大通课表 · v9', WFAlertActionMessage=text_parts('已核验备注中包含本学期完整标记的日程：',value('existing-count','已有课表数量'),' 条。\n为避免重复，本次没有创建日历或添加课程。\n如果上次添加中断，或你要重新导入，请先在日历 App 删除此前生成的整本应大通课表日历，再运行此快捷指令。'), WFAlertActionCancelButtonShown=False),
        branch('if-existing',1),
        action('alert', WFAlertActionTitle='确认添加课表', WFAlertActionMessage=text_token(summary), WFAlertActionCancelButtonShown=True),
        action('addnewcalendar', UUID=ids['calendar'], CalendarName=text_token(name)),
        branch('if-calendar',0,calendar),
        action('repeat.each', GroupingIdentifier=ids['repeat'], WFControlFlowMode=0, WFInput=events),
    ]
    fields = {}
    for key in ['title','start','end','location','notes']:
        field_id = identifier(variant + '-v9-event-' + key)
        fields[key] = ref(field_id, '课程' + key)
        actions.append(action('getvalueforkey', UUID=field_id, WFGetDictionaryValueType='Value', WFDictionaryKey=key, WFInput=repeat_item))
    start = identifier(variant + '-v9-start-date')
    end = identifier(variant + '-v9-end-date')
    actions += [
        action('date', UUID=start, WFDateActionMode='Specified Date', WFDateActionDate=text_token(fields['start'])),
        action('date', UUID=end, WFDateActionMode='Specified Date', WFDateActionDate=text_token(fields['end'])),
        action('addnewevent', WFCalendarItemTitle=text_token(fields['title']), WFCalendarItemLocation=text_token(fields['location']), WFCalendarDescriptor=calendar, WFCalendarItemStartDate=iso_date_token(ref(start,'开始时间')), WFCalendarItemEndDate=iso_date_token(ref(end,'结束时间')), WFCalendarItemAllDay=False, WFCalendarItemNotes=text_token(fields['notes']), ShowWhenRun=False),
        action('repeat.each', UUID=ids['created'], GroupingIdentifier=ids['repeat'], WFControlFlowMode=2),
        action('filter.calendarevents', UUID=ids['saved'], WFContentItemFilter={
            'Value': {'WFActionParameterFilterPrefix':1,'WFActionParameterFilterTemplates':[
                {'Operator':99,'Property':'Notes','Removable':True,'Values':{'String':text_token(marker)}}
            ],'WFContentPredicateBoundedDate':False}, 'WFSerializationType':'WFContentPredicateTableTemplate'
        }, WFContentItemInputParameter='Library', WFContentItemLimitEnabled=False, WFContentItemSortProperty='Start Date', WFContentItemSortOrder='Oldest First'),
        *verify_events('saved'),
        action('count', UUID=ids['count'], Input=value('saved-verified','已核验的已保存课表日程'), WFCountType='Items'),
        positive_count('if-saved',value('count','实际保存数量')),
        action('alert', WFAlertActionTitle='课表添加结果', WFAlertActionMessage=text_parts('日历：',name,'\n计划课程次数：',value('planned-count','计划数量'),'\n系统日历已保存：',value('count','实际保存数量'),'\n\n如数量不一致，请检查本次课表日历；删除该整本日历后可以重新添加。'), WFAlertActionCancelButtonShown=False),
        action('getitemfromlist', UUID=ids['first-event'], WFInput=value('saved-verified','已核验的已保存课表日程'), WFItemSpecifier='First Item'),
        action('showincalendar', WFEvent=value('first-event','第一节课')),
        branch('if-saved',1),
        action('alert', WFAlertActionTitle='尚未确认添加成功', WFAlertActionMessage='系统日历未返回本次课表日程，请检查日历权限和生成的课表日历。此次不报告添加成功。', WFAlertActionCancelButtonShown=False),
        branch('if-saved',2),
        branch('if-calendar',1),
        action('alert', WFAlertActionTitle='未取得新建的课表日历', WFAlertActionMessage='系统没有返回新建的日历对象，未继续添加课程。请检查日历账户和权限后再试。', WFAlertActionCancelButtonShown=False),
        branch('if-calendar',2),
        branch('if-existing',2),
        branch('if-events',1),
        get('error','error'),
        action('alert', WFAlertActionTitle='课表读取未完成 · v9', WFAlertActionMessage=text_token(value('error','错误原因'),'未添加任何日程。具体原因：\n\n'), WFAlertActionCancelButtonShown=False),
        branch('if-events',2),
    ]
    return {
        'WFWorkflowName': '应大通课表导出' + ('（地图适配）' if variant == 'apple-maps' else ''),
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
        obj = package(script, variant)
        xml = plistlib.dumps(obj, fmt=plistlib.FMT_XML, sort_keys=False)
        path = OUT / f'safari-{variant}.unsigned.shortcut'
        path.write_bytes(xml)
        (OUT / f'safari-{variant}.actions.json').write_text(json.dumps(obj, ensure_ascii=False, indent=2))
        summaries.append({'variant': variant, 'name': obj['WFWorkflowName'], 'actions': len(obj['WFWorkflowActions']), 'scriptSha256': hashlib.sha256(script.encode()).hexdigest(), 'unsignedSha256': hashlib.sha256(xml).hexdigest(), 'path': str(path)})
    (OUT / 'unsigned-manifest.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2))
    print(json.dumps(summaries, ensure_ascii=False, indent=2))
